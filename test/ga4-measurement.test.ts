import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { ga4EventName, ga4ParamsFromMeta } from "@/lib/ga4-event-map";
import {
  buildGa4Payload,
  ga4ClientIdFromCookie,
  ga4SessionIdFromCookie,
  sendGa4Payload,
} from "@/lib/ga4-measurement";

const config = { measurementId: "G-TEST1234", apiSecret: "secret value" };

describe("GA4 mapping", () => {
  it("maps funnel events to GA4 recommended events", () => {
    expect(ga4EventName("ViewContent")).toBe("view_item");
    expect(ga4EventName("InitiateCheckout")).toBe("begin_checkout");
    expect(ga4EventName("Purchase")).toBe("purchase");
    expect(ga4EventName("Search")).toBe("search");
    expect(ga4EventName("PageView")).toBeNull();
  });

  it("turns Meta custom data into GA4 items and transaction id", () => {
    expect(
      ga4ParamsFromMeta({
        content_ids: ["var_1"],
        content_name: "Kaos M",
        content_category: "Pakaian",
        contents: [{ id: "var_1", quantity: 2, item_price: 75000 }],
        currency: "idr",
        value: 150000,
        order_id: "ORD-9",
      })
    ).toEqual({
      items: [
        {
          item_id: "var_1",
          item_name: "Kaos M",
          item_category: "Pakaian",
          price: 75000,
          quantity: 2,
        },
      ],
      currency: "IDR",
      value: 150000,
      transaction_id: "ORD-9",
    });
    expect(ga4ParamsFromMeta({ search_string: "kaos" })).toEqual({ search_term: "kaos" });
  });
});

describe("GA4 cookies", () => {
  it("reads the client id from _ga", () => {
    expect(ga4ClientIdFromCookie("GA1.1.1234567890.1700000000")).toBe("1234567890.1700000000");
    expect(ga4ClientIdFromCookie("garbage")).toBeNull();
  });

  it("reads the session id from both _ga_<container> formats", () => {
    expect(ga4SessionIdFromCookie("GS1.1.1700000123.4.1.1700000456.0.0.0")).toBe("1700000123");
    expect(ga4SessionIdFromCookie("GS2.1.s1700000123$o4$g1$t1700000456$j60$l0$h0")).toBe(
      "1700000123"
    );
    expect(ga4SessionIdFromCookie("nope")).toBeNull();
  });
});

describe("GA4 Measurement Protocol", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("builds a purchase with session attribution and a hashed user id", () => {
    const payload = buildGa4Payload({
      name: "purchase",
      clientId: "123.456",
      sessionId: "1700000123",
      userId: "cust_1",
      params: { transaction_id: "ORD-1", value: 100, currency: "IDR" },
      eventTimeMs: 1_700_000_000_000,
    });
    expect(payload).toEqual({
      client_id: "123.456",
      timestamp_micros: 1_700_000_000_000_000,
      user_id: createHash("sha256").update("cust_1").digest("hex"),
      events: [
        {
          name: "purchase",
          params: {
            transaction_id: "ORD-1",
            value: 100,
            currency: "IDR",
            engagement_time_msec: 1,
            session_id: "1700000123",
          },
        },
      ],
    });
  });

  it("posts to /mp/collect with the measurement id and secret", async () => {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const payload = buildGa4Payload({
      name: "refund",
      clientId: "c",
      params: { transaction_id: "ORD-1" },
    });

    await expect(sendGa4Payload(config, payload)).resolves.toEqual({ ok: true, eventsReceived: 1 });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://www.google-analytics.com/mp/collect?measurement_id=G-TEST1234&api_secret=secret%20value"
    );
  });

  it("reports validation messages from the debug endpoint as a failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              validationMessages: [
                { fieldPath: "events.params.currency", description: "Currency is invalid." },
              ],
            }),
            { status: 200 }
          )
      )
    );
    const payload = buildGa4Payload({
      name: "purchase",
      clientId: "c",
      params: { transaction_id: "ORD-1" },
    });

    await expect(sendGa4Payload(config, payload, { debug: true })).resolves.toMatchObject({
      ok: false,
      retryable: false,
      error: "events.params.currency: Currency is invalid.",
    });
  });

  it("retries server errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    const payload = buildGa4Payload({ name: "purchase", clientId: "c", params: {} });
    await expect(sendGa4Payload(config, payload)).resolves.toMatchObject({
      ok: false,
      retryable: true,
      kind: "server",
    });
  });
});
