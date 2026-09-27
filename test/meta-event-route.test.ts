import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rateLimitByIp: vi.fn(),
  sendWorkspaceAdEvent: vi.fn(),
  shouldSendServerViewContent: vi.fn(),
  verifyMetaEventAuthorization: vi.fn(),
}));

vi.mock("@/lib/meta-capi", () => ({
  isMetaStandardEventName: (value: unknown) =>
    typeof value === "string" &&
    ["PageView", "ViewContent", "Purchase", "Lead"].includes(value),
}));

vi.mock("@/lib/ad-events", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ad-events")>(
    "@/lib/ad-events"
  );
  return { ...actual, sendWorkspaceAdEvent: mocks.sendWorkspaceAdEvent };
});

vi.mock("@/lib/rate-limit", () => ({
  rateLimitByIp: mocks.rateLimitByIp,
}));

vi.mock("@/lib/meta-event-auth", () => ({
  verifyMetaEventAuthorization: mocks.verifyMetaEventAuthorization,
}));

vi.mock("@/lib/meta-view-content-throttle", () => ({
  shouldSendServerViewContent: mocks.shouldSendServerViewContent,
}));

import { POST } from "@/app/api/meta/event/route";

describe("/api/meta/event", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyMetaEventAuthorization.mockReturnValue(true);
    mocks.rateLimitByIp.mockResolvedValue({
      ok: true,
      retryAfter: 0,
      remaining: 179,
    });
    mocks.shouldSendServerViewContent.mockResolvedValue(true);
    mocks.sendWorkspaceAdEvent.mockResolvedValue({
      meta: { queued: true, id: "event_1" },
      tiktok: { queued: false, reason: "disabled" },
    });
  });

  it("rejects invalid auth before touching the shared rate limiter", async () => {
    mocks.verifyMetaEventAuthorization.mockReturnValue(false);

    const res = await POST(makeRequest());

    expect(res.status).toBe(403);
    expect(mocks.rateLimitByIp).not.toHaveBeenCalled();
    expect(mocks.sendWorkspaceAdEvent).not.toHaveBeenCalled();
  });

  it("rate limits valid signed events before queueing", async () => {
    mocks.rateLimitByIp.mockResolvedValue({
      ok: false,
      retryAfter: 60,
      remaining: 0,
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(429);
    expect(mocks.verifyMetaEventAuthorization).toHaveBeenCalled();
    expect(mocks.rateLimitByIp).toHaveBeenCalledWith("meta-event", 180, 60_000);
    expect(mocks.sendWorkspaceAdEvent).not.toHaveBeenCalled();
  });

  it("queues authorized events without requiring a workspace lookup", async () => {
    const res = await POST(makeRequest());

    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mocks.rateLimitByIp).toHaveBeenCalledWith("meta-event", 180, 60_000);
    expect(mocks.sendWorkspaceAdEvent).toHaveBeenCalledWith(
      "workspace_1",
      expect.objectContaining({
        eventName: "ViewContent",
        eventId: "event_1",
        sourceUrl: "https://store.example/products/1",
        customData: {
          content_ids: ["product_1"],
          content_type: "product",
        },
      })
    );
  });

  it("accepts an unsigned PageView, which carries no data to forge", async () => {
    mocks.verifyMetaEventAuthorization.mockReturnValue(false);

    const res = await POST(
      makeRequest({ eventName: "PageView", eventId: "pv_1", customData: null, token: undefined })
    );

    expect(res.status).toBe(200);
    expect(mocks.verifyMetaEventAuthorization).not.toHaveBeenCalled();
    expect(mocks.sendWorkspaceAdEvent).toHaveBeenCalledWith(
      "workspace_1",
      expect.objectContaining({ eventName: "PageView", eventId: "pv_1" })
    );
  });

  it("still requires a token for a PageView that carries custom data", async () => {
    mocks.verifyMetaEventAuthorization.mockReturnValue(false);

    const res = await POST(
      makeRequest({ eventName: "PageView", customData: { value: 1 }, token: undefined })
    );

    expect(res.status).toBe(403);
    expect(mocks.sendWorkspaceAdEvent).not.toHaveBeenCalled();
  });

  it("forwards pixel cookies and ad click ids to the server twin", async () => {
    await POST(
      makeRequest(
        {},
        "_fbp=fb.1.1700000000000.111; bd_fbc=fb.1.1700000000000.clickA; _ttp=ttp_abc; bd_ttclid=ttclid_xyz; bd_vid=visitor_1"
      )
    );

    expect(mocks.sendWorkspaceAdEvent).toHaveBeenCalledWith(
      "workspace_1",
      expect.objectContaining({
        clientIp: "203.0.113.7",
        fbp: "fb.1.1700000000000.111",
        // No _fbc from the pixel, so the click the middleware kept is used.
        fbc: "fb.1.1700000000000.clickA",
        ttp: "ttp_abc",
        ttclid: "ttclid_xyz",
        visitorId: "visitor_1",
      })
    );
  });
});

function makeRequest(
  overrides: Record<string, unknown> = {},
  cookie?: string
) {
  return new NextRequest("https://store.example/api/meta/event", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Vitest",
      "x-real-ip": "203.0.113.7",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({
      workspaceId: "workspace_1",
      eventName: "ViewContent",
      eventId: "event_1",
      customData: {
        content_ids: ["product_1"],
        content_type: "product",
      },
      sourceUrl: "https://store.example/products/1",
      token: "signed.token",
      ...overrides,
    }),
  });
}
