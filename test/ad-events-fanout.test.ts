import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  upsert: vi.fn(),
  adPixels: vi.fn(
    async (_args: { where: { provider: string } }) => [] as unknown[]
  ),
}));
const enqueueJob = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationSetting: { findUnique: db.findUnique },
    metaCapiEvent: { create: db.create, findMany: db.findMany, updateMany: db.updateMany },
    metaCapiDailyStat: { upsert: db.upsert },
    adPixel: { findMany: db.adPixels },
  },
}));
vi.mock("@/lib/jobs/queue", () => ({ enqueueJob }));

import { clearAdEventFlushPokeCache } from "@/lib/ad-event-queue";
import { sendWorkspaceAdEvent } from "@/lib/ad-events";
import { clearMetaCapiConfigCache } from "@/lib/meta-capi";
import { clearTikTokConfigCache, flushTikTokQueue } from "@/lib/tiktok-events";

const bothEnabled = {
  metaPixelId: "123456",
  metaCapiEnabled: true,
  metaCapiAccessToken: "meta-token",
  metaCapiTestEventCode: null,
  tiktokPixelId: "C4ABCDEFGH1234567890",
  tiktokEventsApiEnabled: true,
  tiktokAccessToken: "tt-token",
  tiktokTestEventCode: null,
};

describe("sendWorkspaceAdEvent", () => {
  beforeEach(() => {
    // resetAllMocks below wipes implementations; no extra pixels by default.
    db.adPixels.mockResolvedValue([]);
  });

  afterEach(() => {
    clearMetaCapiConfigCache();
    clearTikTokConfigCache();
    clearAdEventFlushPokeCache();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("queues one row per enabled platform, sharing the event id", async () => {
    db.findUnique.mockResolvedValue(bothEnabled);
    // The platforms queue in parallel, so ids come from the row, not call order.
    db.create.mockImplementation(async ({ data }: { data: { provider: string } }) => ({
      id: data.provider === "META" ? "row_meta" : "row_tt",
    }));
    enqueueJob.mockResolvedValue({ id: "job" });

    const result = await sendWorkspaceAdEvent("ws_1", {
      eventName: "AddToCart",
      eventId: "add_to_cart:1",
      sourceUrl: "https://store.example/products/1",
    });

    expect(result).toEqual({
      meta: { queued: true, id: "row_meta" },
      tiktok: { queued: true, id: "row_tt" },
      // GA4 takes only purchases server-side.
      ga4: { queued: false, reason: "unsupported" },
    });
    const rows = db.create.mock.calls.map(([arg]) => arg.data);
    const meta = rows.find((row) => row.provider === "META");
    const tiktok = rows.find((row) => row.provider === "TIKTOK");
    expect(rows).toHaveLength(2);
    expect(meta).toMatchObject({ eventId: "add_to_cart:1" });
    expect(meta.payload).toMatchObject({ event_name: "AddToCart", event_id: "add_to_cart:1" });
    expect(tiktok).toMatchObject({ eventId: "add_to_cart:1" });
    expect(tiktok.payload).toMatchObject({ event: "AddToCart", event_id: "add_to_cart:1" });
    // Both rows share one coalesced poke of the flush job.
    expect(enqueueJob).toHaveBeenCalledTimes(1);
  });

  it("skips a platform that is switched off", async () => {
    db.findUnique.mockResolvedValue({ ...bothEnabled, tiktokEventsApiEnabled: false });
    db.create.mockResolvedValue({ id: "row_meta" });
    enqueueJob.mockResolvedValue({ id: "job" });

    const result = await sendWorkspaceAdEvent("ws_1", {
      eventName: "Purchase",
      eventId: "purchase:1",
      sourceUrl: "https://store.example/checkout/success",
    });

    expect(result.tiktok).toEqual({ queued: false, reason: "disabled" });
    expect(db.create).toHaveBeenCalledTimes(1);
  });

  it("does not queue a TikTok copy of PageView", async () => {
    db.findUnique.mockResolvedValue(bothEnabled);
    db.create.mockResolvedValue({ id: "row_meta" });
    enqueueJob.mockResolvedValue({ id: "job" });

    const result = await sendWorkspaceAdEvent("ws_1", {
      eventName: "PageView",
      eventId: "pv:1",
      sourceUrl: "https://store.example/",
    });

    expect(result.tiktok).toEqual({ queued: false, reason: "unsupported" });
    expect(db.create).toHaveBeenCalledTimes(1);
  });

  it("flushes only TikTok rows and records stats per provider", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T00:00:00Z"));
    db.findUnique.mockResolvedValue(bothEnabled);
    db.findMany
      .mockResolvedValueOnce([{ workspaceId: "ws_1" }])
      .mockResolvedValueOnce([
        {
          id: "row_tt",
          workspaceId: "ws_1",
          attempts: 0,
          payload: {
            event: "CompletePayment",
            event_time: 1_789_257_600,
            event_id: "purchase:1",
            user: {},
            page: { url: "https://store.example/" },
          },
        },
      ]);
    db.updateMany.mockResolvedValue({ count: 1 });
    db.upsert.mockResolvedValue({});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ code: 0, message: "OK" })))
    );

    const summary = await flushTikTokQueue();

    expect(summary.sent).toBe(1);
    expect(db.findMany.mock.calls[0][0].where).toMatchObject({ provider: "TIKTOK" });
    expect(db.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_provider_day: {
            workspaceId: "ws_1",
            provider: "TIKTOK",
            day: new Date("2026-09-13T00:00:00Z"),
          },
        },
      })
    );
  });

  it("queues one row per pixel, each tagged with its target", async () => {
    db.findUnique.mockResolvedValue(bothEnabled);
    db.adPixels.mockImplementation(async ({ where }: { where: { provider: string } }) =>
      where.provider === "META"
        ? [{ pixelId: "999999", accessToken: "meta-token-b", testEventCode: null }]
        : []
    );
    db.create.mockImplementation(async ({ data }: { data: { provider: string; target: string } }) => ({
      id: `${data.provider}:${data.target || "primary"}`,
    }));
    enqueueJob.mockResolvedValue({ id: "job" });

    await sendWorkspaceAdEvent("ws_1", {
      eventName: "AddToCart",
      eventId: "add_to_cart:2",
      sourceUrl: "https://store.example/products/1",
    });

    const metaRows = db.create.mock.calls
      .map(([arg]) => arg.data)
      .filter((row) => row.provider === "META");
    // Same event id for both, so each pixel pairs it with its browser copy.
    expect(metaRows.map((row) => row.target)).toEqual(["", "999999"]);
    expect(new Set(metaRows.map((row) => row.eventId))).toEqual(new Set(["add_to_cart:2"]));
  });

  it("still reaches extra pixels when the primary pixel has no server copy", async () => {
    db.findUnique.mockResolvedValue({ ...bothEnabled, metaCapiEnabled: false, tiktokEventsApiEnabled: false });
    db.adPixels.mockImplementation(async ({ where }: { where: { provider: string } }) =>
      where.provider === "META"
        ? [{ pixelId: "999999", accessToken: "meta-token-b", testEventCode: null }]
        : []
    );
    db.create.mockResolvedValue({ id: "row" });
    enqueueJob.mockResolvedValue({ id: "job" });

    const result = await sendWorkspaceAdEvent("ws_1", {
      eventName: "ViewContent",
      eventId: "view:1",
      sourceUrl: "https://store.example/",
    });

    expect(result.meta).toEqual({ queued: true, id: "row" });
    expect(result.tiktok).toEqual({ queued: false, reason: "disabled" });
    expect(db.create.mock.calls.map(([arg]) => arg.data.target)).toEqual(["999999"]);
  });

  it("sends the primary pixel once even when it is also listed as an extra", async () => {
    db.findUnique.mockResolvedValue(bothEnabled);
    db.adPixels.mockImplementation(async ({ where }: { where: { provider: string } }) =>
      where.provider === "META"
        ? [{ pixelId: bothEnabled.metaPixelId, accessToken: "dup", testEventCode: null }]
        : []
    );
    db.create.mockResolvedValue({ id: "row" });
    enqueueJob.mockResolvedValue({ id: "job" });

    await sendWorkspaceAdEvent("ws_1", { eventName: "AddToCart", eventId: "atc:3", sourceUrl: "https://s/" });

    const metaRows = db.create.mock.calls.map(([arg]) => arg.data).filter((row) => row.provider === "META");
    expect(metaRows.map((row) => row.target)).toEqual([""]);
  });

  it("flushes each pixel with its own token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T00:00:00Z"));
    db.findUnique.mockResolvedValue(bothEnabled);
    db.adPixels.mockResolvedValue([
      { pixelId: "C4EXTRA0000000000000", accessToken: "tt-token-b", testEventCode: null },
    ]);
    const row = (id: string) => ({
      id,
      workspaceId: "ws_1",
      attempts: 0,
      payload: {
        event: "CompletePayment",
        event_time: 1_789_257_600,
        event_id: "purchase:9",
        user: {},
        page: { url: "https://store.example/" },
      },
    });
    db.findMany
      .mockResolvedValueOnce([
        { workspaceId: "ws_1", target: "" },
        { workspaceId: "ws_1", target: "C4EXTRA0000000000000" },
      ])
      .mockResolvedValueOnce([row("row_primary")])
      .mockResolvedValueOnce([row("row_extra")]);
    db.updateMany.mockResolvedValue({ count: 1 });
    db.upsert.mockResolvedValue({});
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init: RequestInit) =>
        new Response(JSON.stringify({ code: 0, message: "OK" }))
    );
    vi.stubGlobal("fetch", fetchMock);

    const summary = await flushTikTokQueue();

    expect(summary.sent).toBe(2);
    expect(summary.workspaces).toBe(1);
    const sent = fetchMock.mock.calls.map(([, init]) => ({
      token: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body)),
    }));
    expect(sent.map((call) => call.token["Access-Token"])).toEqual(["tt-token", "tt-token-b"]);
    expect(sent.map((call) => call.body.event_source_id)).toEqual([
      bothEnabled.tiktokPixelId,
      "C4EXTRA0000000000000",
    ]);
    // Rows are fetched per pixel, never mixed into one request.
    expect(db.findMany.mock.calls[1][0].where).toMatchObject({ target: "" });
    expect(db.findMany.mock.calls[2][0].where).toMatchObject({ target: "C4EXTRA0000000000000" });
  });
});
