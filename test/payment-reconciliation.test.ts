import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  paymentFindMany: vi.fn(),
  paymentFindFirst: vi.fn(),
  reconciliationCreate: vi.fn(),
}));

const midtrans = vi.hoisted(() => {
  class MidtransApiError extends Error {
    status: number | null;
    payload: unknown;

    constructor(
      message: string,
      options: { status?: number; payload?: unknown } = {}
    ) {
      super(message);
      this.name = "MidtransApiError";
      this.status = options.status ?? null;
      this.payload = options.payload ?? null;
    }
  }

  return {
    fetchMidtransTransactionStatus: vi.fn(),
    isMidtransConfigured: vi.fn(),
    mapMidtransStatus: vi.fn(),
    MidtransApiError,
  };
});

const applyPaymentStatus = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    payment: {
      findMany: db.paymentFindMany,
      findFirst: db.paymentFindFirst,
    },
    paymentReconciliationEvent: {
      create: db.reconciliationCreate,
    },
    // No per-workspace override: the module falls back to the env keys.
    ecommerceSetting: { findUnique: async () => null },
  },
}));

vi.mock("@/lib/midtrans", () => ({
  fetchMidtransTransactionStatus: midtrans.fetchMidtransTransactionStatus,
  isMidtransConfigured: midtrans.isMidtransConfigured,
  mapMidtransStatus: midtrans.mapMidtransStatus,
  MidtransApiError: midtrans.MidtransApiError,
}));

vi.mock("@/lib/payments", () => ({
  applyPaymentStatus,
}));

import {
  reconcileMidtransPayment,
  reconcilePendingMidtransPayments,
} from "@/lib/payment-reconciliation";

const now = new Date("2026-09-09T08:00:00Z");

describe("reconcilePendingMidtransPayments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    midtrans.isMidtransConfigured.mockReturnValue(true);
    midtrans.mapMidtransStatus.mockReturnValue("PAID");
    db.paymentFindMany.mockResolvedValue([payment()]);
    db.reconciliationCreate.mockResolvedValue({ id: "sync_1" });
    applyPaymentStatus.mockResolvedValue({ changed: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips each payment whose workspace has no Midtrans credentials", async () => {
    // Credentials are per workspace now, so the sweep can no longer bail up
    // front: another workspace in the same batch may well be configured.
    midtrans.isMidtransConfigured.mockReturnValue(false);

    const summary = await reconcilePendingMidtransPayments({ now });

    expect(summary.unconfigured).toBe(true);
    expect(summary.skipped).toBe(1);
    expect(summary.synced).toBe(0);
    expect(midtrans.fetchMidtransTransactionStatus).not.toHaveBeenCalled();
  });

  it("syncs a paid Midtrans payment and records an audit event", async () => {
    midtrans.fetchMidtransTransactionStatus.mockResolvedValue(
      midtransPayload({ transaction_status: "settlement" })
    );

    const summary = await reconcilePendingMidtransPayments({ now });

    expect(summary).toEqual({
      scanned: 1,
      synced: 1,
      unchanged: 0,
      notFound: 0,
      failed: 0,
      skipped: 0,
      unconfigured: false,
    });
    expect(db.paymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PENDING",
          provider: "midtrans",
          createdAt: { lte: new Date("2026-09-09T07:58:00Z") },
        }),
        take: 50,
      })
    );
    expect(applyPaymentStatus).toHaveBeenCalledWith(
      "payment_1",
      "PAID",
      expect.objectContaining({
        transactionStatus: "settlement",
        transactionId: "trx_1",
        rawNotification: expect.objectContaining({
          source: "midtrans_reconciliation",
        }),
      })
    );
    expect(db.reconciliationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace_1",
        paymentId: "payment_1",
        result: "SYNCED",
        midtransOrderId: "BD-1",
        previousStatus: "PENDING",
        mappedStatus: "PAID",
        changedPayment: true,
        checkedAt: now,
      }),
    });
  });

  it("records unchanged status when Midtrans still reports pending", async () => {
    midtrans.mapMidtransStatus.mockReturnValue("PENDING");
    midtrans.fetchMidtransTransactionStatus.mockResolvedValue(
      midtransPayload({ transaction_status: "pending" })
    );
    applyPaymentStatus.mockResolvedValue({ changed: false });

    const summary = await reconcilePendingMidtransPayments({ now });

    expect(summary.unchanged).toBe(1);
    expect(summary.synced).toBe(0);
    expect(db.reconciliationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        result: "UNCHANGED",
        mappedStatus: "PENDING",
        changedPayment: false,
      }),
    });
  });

  it("records not-found responses without calling the transition layer", async () => {
    midtrans.fetchMidtransTransactionStatus.mockRejectedValue(
      new midtrans.MidtransApiError("Transaction not found", {
        status: 404,
        payload: { status_message: "not found" },
      })
    );

    const summary = await reconcilePendingMidtransPayments({ now });

    expect(summary.notFound).toBe(1);
    expect(applyPaymentStatus).not.toHaveBeenCalled();
    expect(db.reconciliationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        result: "NOT_FOUND",
        error: "Transaction not found",
      }),
    });
  });

  it("records failed reconciliation attempts", async () => {
    midtrans.fetchMidtransTransactionStatus.mockRejectedValue(
      new Error("network timeout")
    );

    const summary = await reconcilePendingMidtransPayments({ now });

    expect(summary.failed).toBe(1);
    expect(db.reconciliationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        result: "FAILED",
        error: "network timeout",
      }),
    });
  });
});

describe("reconcileMidtransPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    midtrans.isMidtransConfigured.mockReturnValue(true);
    midtrans.mapMidtransStatus.mockReturnValue("PAID");
    midtrans.fetchMidtransTransactionStatus.mockResolvedValue(
      midtransPayload({ transaction_status: "settlement" })
    );
    db.paymentFindFirst.mockResolvedValue(payment());
    db.reconciliationCreate.mockResolvedValue({ id: "sync_1" });
    applyPaymentStatus.mockResolvedValue({ changed: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("syncs one payment and reports the outcome", async () => {
    const result = await reconcileMidtransPayment("payment_1", {
      workspaceId: "workspace_1",
      now,
    });

    expect(result).toEqual({ ok: true, result: "SYNCED" });
    expect(applyPaymentStatus).toHaveBeenCalledWith(
      "payment_1",
      "PAID",
      expect.objectContaining({ transactionStatus: "settlement" })
    );
    expect(db.reconciliationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ result: "SYNCED" }),
    });
  });

  it("scopes the lookup to the caller's workspace", async () => {
    await reconcileMidtransPayment("payment_1", {
      workspaceId: "workspace_1",
      now,
    });

    expect(db.paymentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "payment_1",
          workspaceId: "workspace_1",
          provider: "midtrans",
        },
      })
    );
  });

  it("refuses a payment that belongs to another workspace", async () => {
    db.paymentFindFirst.mockResolvedValue(null);

    const result = await reconcileMidtransPayment("payment_1", {
      workspaceId: "workspace_2",
      now,
    });

    expect(result).toEqual({ ok: false, error: "Payment tidak ditemukan." });
    expect(applyPaymentStatus).not.toHaveBeenCalled();
  });

  it("is a no-op on a payment that already settled", async () => {
    db.paymentFindFirst.mockResolvedValue(payment({ status: "PAID" }));

    const result = await reconcileMidtransPayment("payment_1", {
      workspaceId: "workspace_1",
      now,
    });

    expect(result).toEqual({ ok: false, error: "Payment ini sudah final." });
    expect(midtrans.fetchMidtransTransactionStatus).not.toHaveBeenCalled();
  });

  it("reports a provider failure instead of a silent success", async () => {
    midtrans.fetchMidtransTransactionStatus.mockRejectedValue(
      new Error("network timeout")
    );

    const result = await reconcileMidtransPayment("payment_1", {
      workspaceId: "workspace_1",
      now,
    });

    expect(result).toEqual({
      ok: false,
      error: "Sync ke Midtrans gagal. Coba lagi.",
    });
    expect(db.reconciliationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ result: "FAILED" }),
    });
  });

  it("surfaces a transaction Midtrans has never heard of", async () => {
    midtrans.fetchMidtransTransactionStatus.mockRejectedValue(
      new midtrans.MidtransApiError("Transaction not found", { status: 404 })
    );

    const result = await reconcileMidtransPayment("payment_1", {
      workspaceId: "workspace_1",
      now,
    });

    expect(result).toEqual({ ok: true, result: "NOT_FOUND" });
    expect(applyPaymentStatus).not.toHaveBeenCalled();
  });

  it("refuses to run while Midtrans is unconfigured", async () => {
    midtrans.isMidtransConfigured.mockReturnValue(false);

    const result = await reconcileMidtransPayment("payment_1", {
      workspaceId: "workspace_1",
      now,
    });

    expect(result).toEqual({
      ok: false,
      error: "Midtrans belum dikonfigurasi.",
    });
    // The payment is read first — its workspace is what holds the keys.
    expect(midtrans.fetchMidtransTransactionStatus).not.toHaveBeenCalled();
  });
});

function payment(overrides: { status?: string } = {}) {
  return {
    id: "payment_1",
    workspaceId: "workspace_1",
    status: "PENDING",
    midtransOrderId: "BD-1",
    ...overrides,
  };
}

function midtransPayload(input: { transaction_status: string }) {
  return {
    order_id: "BD-1",
    transaction_status: input.transaction_status,
    fraud_status: "accept",
    transaction_id: "trx_1",
    payment_type: "bank_transfer",
    status_code: "200",
    gross_amount: "100000.00",
  };
}
