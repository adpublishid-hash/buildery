import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
}));

const enqueueJob = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationSetting: {
      findUnique: db.findUnique,
    },
    metaCapiEvent: {
      create: db.create,
    },
    // No extra pixels: only the primary one receives events.
    adPixel: { findMany: async () => [] },
  },
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueueJob,
}));

import {
  clearMetaCapiConfigCache,
  clearMetaCapiFlushPokeCache,
  sendWorkspaceMetaEvent,
} from "@/lib/meta-capi";

const eventInput = {
  eventName: "ViewContent" as const,
  eventId: "view:product:1",
  sourceUrl: "https://store.example/products/1",
  customData: {
    content_ids: ["product_1"],
    content_type: "product",
  },
};

describe("Meta CAPI flush job poke", () => {
  afterEach(() => {
    clearMetaCapiConfigCache();
    clearMetaCapiFlushPokeCache();
    db.findUnique.mockReset();
    db.create.mockReset();
    enqueueJob.mockReset();
    vi.useRealTimers();
  });

  it("coalesces repeated flush enqueue attempts while preserving queued events", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T00:00:00Z"));
    db.findUnique.mockResolvedValue({
      metaPixelId: "pixel_1",
      metaCapiEnabled: true,
      metaCapiAccessToken: "token_1",
      metaCapiTestEventCode: null,
    });
    db.create.mockResolvedValue({ id: "queued_event" });
    enqueueJob.mockResolvedValue({ id: "flush_job" });

    await sendWorkspaceMetaEvent("workspace_1", eventInput);
    await sendWorkspaceMetaEvent("workspace_1", {
      ...eventInput,
      eventId: "view:product:2",
    });

    expect(db.create).toHaveBeenCalledTimes(2);
    expect(db.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventName: "ViewContent",
          eventId: "view:product:1",
        }),
      })
    );
    expect(enqueueJob).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10_001);
    await sendWorkspaceMetaEvent("workspace_1", {
      ...eventInput,
      eventId: "view:product:3",
    });

    expect(db.create).toHaveBeenCalledTimes(3);
    expect(enqueueJob).toHaveBeenCalledTimes(2);
  });

  it("retries the next event when the scheduler poke fails", async () => {
    db.findUnique.mockResolvedValue({
      metaPixelId: "pixel_1",
      metaCapiEnabled: true,
      metaCapiAccessToken: "token_1",
      metaCapiTestEventCode: null,
    });
    db.create.mockResolvedValue({ id: "queued_event" });
    enqueueJob
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce({ id: "flush_job" });

    await expect(
      sendWorkspaceMetaEvent("workspace_1", eventInput)
    ).rejects.toThrow("database unavailable");
    await expect(
      sendWorkspaceMetaEvent("workspace_1", {
        ...eventInput,
        eventId: "view:product:2",
      })
    ).resolves.toEqual({ queued: true, id: "queued_event" });

    expect(db.create).toHaveBeenCalledTimes(2);
    expect(enqueueJob).toHaveBeenCalledTimes(2);
  });

  it("skips scheduler work when the event is already queued or sent", async () => {
    db.findUnique.mockResolvedValue({
      metaPixelId: "pixel_1",
      metaCapiEnabled: true,
      metaCapiAccessToken: "token_1",
      metaCapiTestEventCode: null,
    });
    db.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
    );

    await expect(
      sendWorkspaceMetaEvent("workspace_1", eventInput)
    ).resolves.toEqual({ queued: false, reason: "duplicate" });

    expect(db.create).toHaveBeenCalledTimes(1);
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});
