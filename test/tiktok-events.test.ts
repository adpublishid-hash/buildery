import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildTikTokEventPayload,
  classifyTikTokFailure,
  sendTikTokEventsBatch,
} from "@/lib/tiktok-events";
import { tiktokEventName, tiktokPropertiesFromMeta } from "@/lib/tiktok-event-map";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const config = { pixelId: "C4ABCDEFGH1234567890", accessToken: "tt-token", testEventCode: "TEST123" };

describe("TikTok event mapping", () => {
  it("maps Buildery's (Meta-named) events to TikTok's names", () => {
    expect(tiktokEventName("Purchase")).toBe("CompletePayment");
    expect(tiktokEventName("Lead")).toBe("SubmitForm");
    expect(tiktokEventName("AddToCart")).toBe("AddToCart");
    expect(tiktokEventName("PageView")).toBeNull();
    expect(tiktokEventName("Donate")).toBeNull();
  });

  it("merges contents and content ids into TikTok contents", () => {
    expect(
      tiktokPropertiesFromMeta({
        content_ids: ["p1", "p2"],
        contents: [{ id: "p1", quantity: 2, item_price: 50000 }],
        currency: "idr",
        value: 150000,
        order_id: "ORD-1",
      })
    ).toEqual({
      contents: [
        { content_id: "p1", quantity: 2, price: 50000 },
        { content_id: "p2" },
      ],
      content_type: "product",
      currency: "IDR",
      value: 150000,
      order_id: "ORD-1",
    });
  });
});

describe("buildTikTokEventPayload", () => {
  it("builds a v1.3 event with hashed identity and raw TikTok cookies", () => {
    const payload = buildTikTokEventPayload({
      eventName: "Purchase",
      eventId: "purchase:order:ORD-1",
      eventTime: 1_700_000_000,
      sourceUrl: "https://store.example/checkout/success",
      referrerUrl: "https://store.example/checkout",
      clientIp: "203.0.113.10",
      userAgent: "Vitest",
      ttp: "ttp_cookie",
      ttclid: "E.C.P.click",
      customerData: { email: " Buyer@Example.com ", phone: "0812-345-678", externalId: "cust_1" },
      customData: { content_ids: ["p1"], content_name: "Starter Kit", value: 100000, currency: "IDR" },
    });

    expect(payload).toEqual({
      event: "CompletePayment",
      event_time: 1_700_000_000,
      event_id: "purchase:order:ORD-1",
      user: {
        email: sha256("buyer@example.com"),
        // E.164 with the plus sign, as TikTok hashes it.
        phone: sha256("+62812345678"),
        external_id: sha256("cust_1"),
        ttp: "ttp_cookie",
        ttclid: "E.C.P.click",
        ip: "203.0.113.10",
        user_agent: "Vitest",
      },
      page: { url: "https://store.example/checkout/success", referrer: "https://store.example/checkout" },
      properties: {
        contents: [{ content_id: "p1", content_name: "Starter Kit" }],
        content_type: "product",
        currency: "IDR",
        value: 100000,
      },
    });
  });

  it("returns null for events TikTok has no equivalent for", () => {
    expect(
      buildTikTokEventPayload({ eventName: "PageView", eventId: "pv", sourceUrl: "https://s.example/" })
    ).toBeNull();
  });
});

describe("sendTikTokEventsBatch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubResponse(body: unknown, status = 200) {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(body), { status })
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const event = buildTikTokEventPayload({
    eventName: "AddToCart",
    eventId: "atc:1",
    sourceUrl: "https://store.example/products/1",
  })!;

  it("posts to the v1.3 endpoint with the token in a header", async () => {
    const fetchMock = stubResponse({ code: 0, message: "OK" });

    await expect(sendTikTokEventsBatch(config, [event])).resolves.toEqual({
      ok: true,
      eventsReceived: 1,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://business-api.tiktok.com/open_api/v1.3/event/track/");
    expect((init?.headers as Record<string, string>)["Access-Token"]).toBe("tt-token");
    expect(JSON.parse(String(init?.body))).toEqual({
      event_source: "web",
      event_source_id: "C4ABCDEFGH1234567890",
      test_event_code: "TEST123",
      data: [event],
    });
  });

  it("treats HTTP 200 with a non-zero code as a failure", async () => {
    stubResponse({ code: 40105, message: "Access token is incorrect or has been revoked." });

    await expect(sendTikTokEventsBatch(config, [event])).resolves.toMatchObject({
      ok: false,
      retryable: false,
      kind: "auth",
      code: 40105,
    });
  });

  it("retries rate limits and server errors, not bad requests", () => {
    expect(classifyTikTokFailure(200, 40100)).toEqual({ retryable: true, kind: "rate_limited" });
    expect(classifyTikTokFailure(429, null)).toEqual({ retryable: true, kind: "rate_limited" });
    expect(classifyTikTokFailure(200, 50000)).toEqual({ retryable: true, kind: "server" });
    expect(classifyTikTokFailure(502, null)).toEqual({ retryable: true, kind: "server" });
    expect(classifyTikTokFailure(200, 40002)).toEqual({ retryable: false, kind: "client" });
  });

  it("marks network failures retryable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("socket hang up");
      })
    );
    await expect(sendTikTokEventsBatch(config, [event])).resolves.toMatchObject({
      ok: false,
      retryable: true,
      kind: "network",
    });
  });
});
