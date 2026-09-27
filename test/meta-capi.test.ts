import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { isMetaStandardEventName, sendMetaCapiEvent } from "@/lib/meta-capi";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

describe("Meta CAPI", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("validates supported standard event names", () => {
    expect(isMetaStandardEventName("Purchase")).toBe(true);
    expect(isMetaStandardEventName("CompleteRegistration")).toBe(true);
    expect(isMetaStandardEventName("Purchased")).toBe(false);
  });

  it("sends a standard event with hashed customer data and custom data", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response("{}", { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendMetaCapiEvent({
      pixelId: "123456",
      accessToken: "token value",
      testEventCode: "TEST123",
      eventName: "Purchase",
      eventId: "purchase:order:ORD-1",
      eventTime: 1_700_000_000,
      sourceUrl: "https://store.example/checkout/success?order=ORD-1",
      referrerUrl: "https://store.example/products",
      clientIp: "203.0.113.10",
      userAgent: "Vitest",
      fbp: "fb.1.1700000000000.111",
      fbc: "fb.1.1700000000000.click",
      customerData: {
        email: " Buyer@Example.COM ",
        phone: "+62 812-345",
        firstName: " Wahib ",
        lastName: " Rohman ",
      },
      customData: {
        content_ids: ["prod_1"],
        content_name: "Starter Kit",
        content_type: "product",
        contents: [{ id: "prod_1", quantity: 2, item_price: 50000 }],
        currency: "idr",
        value: 100000,
        num_items: 2,
        order_id: "ORD-1",
      },
    });

    expect(result).toEqual({ ok: true, eventsReceived: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      RequestInfo | URL,
      RequestInit | undefined,
    ];
    expect(String(url)).toBe("https://graph.facebook.com/v26.0/123456/events");
    // The token rides in the body so it never appears in logged URLs.
    expect(String(url)).not.toContain("access_token");
    expect(init?.signal).toBeInstanceOf(AbortSignal);

    const body = JSON.parse(String(init?.body));
    expect(body.access_token).toBe("token value");
    expect(body.test_event_code).toBe("TEST123");
    const event = body.data[0];
    expect(event).toMatchObject({
      event_name: "Purchase",
      event_time: 1_700_000_000,
      event_id: "purchase:order:ORD-1",
      action_source: "website",
      event_source_url: "https://store.example/checkout/success?order=ORD-1",
      referrer_url: "https://store.example/products",
    });
    expect(event.user_data).toMatchObject({
      client_ip_address: "203.0.113.10",
      client_user_agent: "Vitest",
      fbp: "fb.1.1700000000000.111",
      fbc: "fb.1.1700000000000.click",
      em: sha256("buyer@example.com"),
      ph: sha256("62812345"),
      fn: sha256("wahib"),
      ln: sha256("rohman"),
    });
    expect(event.custom_data).toMatchObject({
      content_ids: ["prod_1"],
      content_name: "Starter Kit",
      content_type: "product",
      contents: [{ id: "prod_1", quantity: 2, item_price: 50000 }],
      currency: "IDR",
      value: 100000,
      num_items: 2,
      order_id: "ORD-1",
    });
  });

  it("classifies temporary Meta failures as retryable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({ error: { message: "temporarily unavailable", code: 2 } }),
          { status: 500 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendMetaCapiEvent({
      pixelId: "123456",
      accessToken: "token",
      eventName: "Lead",
      eventId: "lead:1",
      sourceUrl: "https://store.example/form",
    });

    expect(result).toMatchObject({
      ok: false,
      retryable: true,
      kind: "server",
      status: 500,
      code: 2,
    });
  });

  it("classifies expired access tokens as permanent auth failures", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            error: { message: "Invalid OAuth access token.", code: 190 },
          }),
          { status: 400 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendMetaCapiEvent({
      pixelId: "123456",
      accessToken: "expired",
      eventName: "Purchase",
      eventId: "purchase:1",
      sourceUrl: "https://store.example/checkout/success",
    });

    expect(result).toMatchObject({
      ok: false,
      retryable: false,
      kind: "auth",
      status: 400,
      code: 190,
    });
  });
});

describe("Meta CAPI match quality", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds a country code to local Indonesian numbers and hashes location and external id", async () => {
    const { buildMetaCapiEventPayload } = await import("@/lib/meta-capi");
    const payload = buildMetaCapiEventPayload({
      eventName: "Purchase",
      eventId: "purchase:order:ORD-2",
      sourceUrl: "https://store.example/checkout/success",
      visitorId: "visitor-1",
      customerData: {
        phone: "0812-3456-7890",
        city: "Kota Bandung",
        postalCode: "40 111",
        country: "ID",
        externalId: "customer-1",
      },
    });

    expect(payload.user_data).toMatchObject({
      ph: sha256("6281234567890"),
      ct: sha256("bandung"),
      zp: sha256("40111"),
      country: sha256("id"),
      // A known customer wins over the anonymous visitor id.
      external_id: sha256("customer-1"),
    });
  });

  it("falls back to the visitor id when no customer is known", async () => {
    const { buildMetaCapiEventPayload } = await import("@/lib/meta-capi");
    const payload = buildMetaCapiEventPayload({
      eventName: "PageView",
      eventId: "pv:1",
      sourceUrl: "https://store.example/",
      visitorId: "visitor-1",
    });
    expect(payload.user_data.external_id).toBe(sha256("visitor-1"));
    expect(payload.user_data).not.toHaveProperty("ph");
  });
});
