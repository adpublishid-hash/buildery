import { afterEach, describe, expect, it, vi } from "vitest";

describe("fetchMidtransTransactionStatus", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("calls Midtrans sandbox status API with server-key basic auth", async () => {
    vi.stubEnv("MIDTRANS_SERVER_KEY", "server_key");
    vi.stubEnv("MIDTRANS_CLIENT_KEY", "client_key");
    vi.stubEnv("MIDTRANS_IS_PRODUCTION", "false");
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            order_id: "BD-1",
            transaction_status: "settlement",
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { fetchMidtransTransactionStatus } = await import("@/lib/midtrans");
    const result = await fetchMidtransTransactionStatus("BD-1");

    expect(result.transaction_status).toBe("settlement");
    const [url, init] = fetchMock.mock.calls[0] as [
      RequestInfo | URL,
      RequestInit | undefined,
    ];
    expect(String(url)).toBe(
      "https://api.sandbox.midtrans.com/v2/BD-1/status"
    );
    expect(init?.headers).toMatchObject({
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from("server_key:").toString("base64")}`,
    });
  });

  it("throws a typed error for failed status responses", async () => {
    vi.stubEnv("MIDTRANS_SERVER_KEY", "server_key");
    vi.stubEnv("MIDTRANS_CLIENT_KEY", "client_key");
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ status_message: "not found" }), {
          status: 404,
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { MidtransApiError, fetchMidtransTransactionStatus } = await import(
      "@/lib/midtrans"
    );

    await expect(fetchMidtransTransactionStatus("BD-404")).rejects.toMatchObject({
      name: "MidtransApiError",
      status: 404,
      message: "not found",
    });
    await expect(fetchMidtransTransactionStatus("BD-404")).rejects.toBeInstanceOf(
      MidtransApiError
    );
  });

  it("calls Midtrans sandbox refund API with an idempotent refund key", async () => {
    vi.stubEnv("MIDTRANS_SERVER_KEY", "server_key");
    vi.stubEnv("MIDTRANS_CLIENT_KEY", "client_key");
    vi.stubEnv("MIDTRANS_IS_PRODUCTION", "false");
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            status_code: "200",
            transaction_status: "partial_refund",
            refund_key: "refund_1",
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { requestMidtransRefund } = await import("@/lib/midtrans");
    const result = await requestMidtransRefund({
      transactionRef: "BD-1",
      refundKey: "refund_1",
      amount: 50_000,
      reason: "Customer request",
    });

    expect(result.transaction_status).toBe("partial_refund");
    const [url, init] = fetchMock.mock.calls[0] as [
      RequestInfo | URL,
      RequestInit | undefined,
    ];
    expect(String(url)).toBe(
      "https://api.sandbox.midtrans.com/v2/BD-1/refund"
    );
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from("server_key:").toString("base64")}`,
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      refund_key: "refund_1",
      amount: 50_000,
      reason: "Customer request",
    });
  });

  it("calls Midtrans sandbox cancel API", async () => {
    vi.stubEnv("MIDTRANS_SERVER_KEY", "server_key");
    vi.stubEnv("MIDTRANS_CLIENT_KEY", "client_key");
    vi.stubEnv("MIDTRANS_IS_PRODUCTION", "false");
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            status_code: "200",
            transaction_status: "cancel",
            transaction_id: "txn_1",
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { requestMidtransCancel } = await import("@/lib/midtrans");
    const result = await requestMidtransCancel("BD-1");

    expect(result.transaction_status).toBe("cancel");
    const [url, init] = fetchMock.mock.calls[0] as [
      RequestInfo | URL,
      RequestInit | undefined,
    ];
    expect(String(url)).toBe(
      "https://api.sandbox.midtrans.com/v2/BD-1/cancel"
    );
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from("server_key:").toString("base64")}`,
    });
  });
});
