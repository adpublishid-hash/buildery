import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationSetting: {
      findUnique: db.findUnique,
    },
    metaCapiEvent: {
      findMany: db.findMany,
      updateMany: db.updateMany,
    },
    metaCapiDailyStat: {
      upsert: db.upsert,
    },
  },
}));

import {
  clearMetaCapiConfigCache,
  flushMetaCapiQueue,
} from "@/lib/meta-capi";

describe("Meta CAPI retry backoff", () => {
  afterEach(() => {
    clearMetaCapiConfigCache();
    db.findUnique.mockReset();
    db.findMany.mockReset();
    db.updateMany.mockReset();
    db.upsert.mockReset();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("only selects due events for flushing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T00:00:00Z"));
    db.findMany.mockResolvedValueOnce([]);

    await flushMetaCapiQueue();

    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sentAt: null,
          failedAt: null,
          OR: [
            { nextAttemptAt: null },
            { nextAttemptAt: { lte: new Date("2026-09-09T00:00:00Z") } },
          ],
        }),
      })
    );
  });

  it("backs off retryable failures by attempt count", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T00:00:00Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          new Response(
            JSON.stringify({
              error: { message: "temporarily unavailable", code: 2 },
            }),
            { status: 500 }
          )
      )
    );
    db.findUnique.mockResolvedValue({
      metaPixelId: "pixel_1",
      metaCapiEnabled: true,
      metaCapiAccessToken: "token_1",
      metaCapiTestEventCode: null,
    });
    db.findMany
      .mockResolvedValueOnce([{ workspaceId: "workspace_1" }])
      .mockResolvedValueOnce([
        queuedRow("row_1", 0, "view:1"),
        queuedRow("row_2", 2, "view:2"),
      ]);
    db.updateMany.mockResolvedValue({ count: 1 });
    db.upsert.mockResolvedValue({});

    const summary = await flushMetaCapiQueue();

    expect(summary.retrying).toBe(2);
    expect(summary.failed).toBe(0);
    expect(db.updateMany).toHaveBeenCalledTimes(2);
    expect(db.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: { in: ["row_1"] } },
        data: expect.objectContaining({
          attempts: { increment: 1 },
          nextAttemptAt: new Date("2026-09-09T00:02:00Z"),
        }),
      })
    );
    expect(db.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: { in: ["row_2"] } },
        data: expect.objectContaining({
          attempts: { increment: 1 },
          nextAttemptAt: new Date("2026-09-09T00:08:00Z"),
        }),
      })
    );
  });
});

function queuedRow(id: string, attempts: number, eventId: string) {
  return {
    id,
    workspaceId: "workspace_1",
    attempts,
    payload: {
      event_name: "ViewContent",
      event_time: 1_788_912_000,
      event_id: eventId,
      action_source: "website",
      event_source_url: "https://store.example/products/1",
      user_data: {},
    },
  };
}
