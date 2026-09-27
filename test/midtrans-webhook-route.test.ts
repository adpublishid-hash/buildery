import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  paymentFindUnique: vi.fn(),
  isMidtransConfigured: vi.fn(),
  verifyMidtransSignature: vi.fn(),
  mapMidtransStatus: vi.fn(),
  applyPaymentStatus: vi.fn(),
  recordPaymentWebhookEvent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    payment: {
      findUnique: mocks.paymentFindUnique,
    },
    // No per-workspace override: the module falls back to the env keys.
    ecommerceSetting: { findUnique: async () => null },
  },
}));

vi.mock("@/lib/midtrans", () => ({
  isMidtransConfigured: mocks.isMidtransConfigured,
  verifyMidtransSignature: mocks.verifyMidtransSignature,
  mapMidtransStatus: mocks.mapMidtransStatus,
}));

vi.mock("@/lib/payments", () => ({
  applyPaymentStatus: mocks.applyPaymentStatus,
}));

vi.mock("@/lib/payment-webhooks", () => ({
  recordPaymentWebhookEvent: mocks.recordPaymentWebhookEvent,
}));

import { POST } from "@/app/api/payments/midtrans/webhook/route";

describe("Midtrans webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.isMidtransConfigured.mockReturnValue(true);
    mocks.verifyMidtransSignature.mockReturnValue(true);
    mocks.mapMidtransStatus.mockReturnValue("PAID");
    mocks.paymentFindUnique.mockResolvedValue({
      id: "payment_1",
      workspaceId: "workspace_1",
      midtransOrderId: "BD-1",
    });
    mocks.applyPaymentStatus.mockResolvedValue({ changed: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records bad signatures before rejecting the webhook", async () => {
    mocks.verifyMidtransSignature.mockReturnValue(false);

    const res = await POST(makeRequest());

    expect(res.status).toBe(403);
    // The payment is now read before verification — the signing key belongs to
    // its workspace — but a bad signature must still stop everything after.
    expect(mocks.applyPaymentStatus).not.toHaveBeenCalled();
    expect(mocks.recordPaymentWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        result: "BAD_SIGNATURE",
        signatureValid: false,
        midtransOrderId: "BD-1",
      })
    );
  });

  it("records unknown signed payment notifications and acknowledges them", async () => {
    mocks.paymentFindUnique.mockResolvedValue(null);

    const res = await POST(makeRequest());

    await expect(res.json()).resolves.toEqual({ received: true });
    expect(mocks.applyPaymentStatus).not.toHaveBeenCalled();
    expect(mocks.recordPaymentWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        result: "UNKNOWN_PAYMENT",
        signatureValid: true,
        midtransOrderId: "BD-1",
      })
    );
  });

  it("records successful processing with changed-payment metadata", async () => {
    const res = await POST(makeRequest());

    await expect(res.json()).resolves.toEqual({ received: true });
    expect(mocks.applyPaymentStatus).toHaveBeenCalledWith(
      "payment_1",
      "PAID",
      expect.objectContaining({ transactionStatus: "settlement" })
    );
    expect(mocks.recordPaymentWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_1",
        paymentId: "payment_1",
        result: "PROCESSED",
        mappedStatus: "PAID",
        changedPayment: true,
      })
    );
  });

  it("records processing failures and keeps the webhook retryable", async () => {
    mocks.applyPaymentStatus.mockRejectedValue(new Error("stock unavailable"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect(mocks.recordPaymentWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        result: "PROCESSING_FAILED",
        signatureValid: true,
        error: "stock unavailable",
      })
    );
  });
});

function makeRequest() {
  return new NextRequest("https://buildery.example/api/payments/midtrans/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      order_id: "BD-1",
      status_code: "200",
      gross_amount: "100000.00",
      signature_key: "signature",
      transaction_status: "settlement",
      fraud_status: "accept",
      transaction_id: "trx_1",
      payment_type: "bank_transfer",
    }),
  });
}
