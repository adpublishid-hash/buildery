import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  paymentFindMany: vi.fn(),
  paymentFindFirst: vi.fn(),
  transaction: vi.fn(),
  txPaymentFindUnique: vi.fn(),
  txPaymentUpdateMany: vi.fn(),
  txPaymentFindUniqueOrThrow: vi.fn(),
  txOrderFindUnique: vi.fn(),
  txOrderUpdate: vi.fn(),
  txOrderUpdateMany: vi.fn(),
  txProductUpdateMany: vi.fn(),
  txProductFindUnique: vi.fn(),
  txInventoryMovementCreate: vi.fn(),
  txFulfillmentEventCreate: vi.fn(),
  txEnrollmentUpdate: vi.fn(),
  txCustomerMembershipUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    payment: {
      findMany: db.paymentFindMany,
      findFirst: db.paymentFindFirst,
    },
    $transaction: db.transaction,
  },
}));

vi.mock("@/lib/meta-capi", () => ({
  sendWorkspaceMetaEvent: vi.fn(),
}));

vi.mock("@/lib/store-notifications", () => ({
  queueOrderNotifications: vi.fn(),
}));

import { expireOverduePayment, expireOverduePayments } from "@/lib/payments";

const now = new Date("2026-09-09T01:00:00Z");
const expiresAt = new Date("2026-09-09T00:30:00Z");

describe("expireOverduePayments", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("marks overdue pending payments as expired and unwinds linked orders", async () => {
    db.paymentFindMany.mockResolvedValue([
      {
        id: "payment_1",
        midtransOrderId: "BD-1",
        expiresAt,
      },
    ]);
    db.transaction.mockImplementation(async (callback) =>
      callback({
        payment: {
          findUnique: db.txPaymentFindUnique,
          updateMany: db.txPaymentUpdateMany,
          findUniqueOrThrow: db.txPaymentFindUniqueOrThrow,
        },
        order: {
          findUnique: db.txOrderFindUnique,
          update: db.txOrderUpdate,
          updateMany: db.txOrderUpdateMany,
        },
        product: {
          updateMany: db.txProductUpdateMany,
          findUnique: db.txProductFindUnique,
        },
        inventoryMovement: { create: db.txInventoryMovementCreate },
        fulfillmentEvent: { create: db.txFulfillmentEventCreate },
        enrollment: { update: db.txEnrollmentUpdate },
        customerMembership: { update: db.txCustomerMembershipUpdate },
      })
    );
    db.txPaymentFindUnique.mockResolvedValue({
      id: "payment_1",
      status: "PENDING",
      kind: "ORDER",
      amount: 100_000,
      midtransOrderId: "BD-1",
      orderId: "order_1",
      enrollmentId: null,
      customerMembershipId: null,
      transactionId: null,
      transactionStatus: null,
      paymentType: null,
      fraudStatus: null,
      paidAt: null,
    });
    db.txPaymentUpdateMany.mockResolvedValue({ count: 1 });
    db.txOrderUpdate.mockResolvedValue({});
    db.txOrderFindUnique.mockResolvedValue({
      id: "order_1",
      workspaceId: "workspace_1",
      fulfillmentStatus: "UNFULFILLED",
      stockReservedAt: new Date("2026-09-09T00:00:00Z"),
      stockReleasedAt: null,
      items: [
        {
          productId: "product_1",
          nameSnapshot: "T-Shirt",
          quantity: 2,
          product: { type: "PHYSICAL" },
        },
      ],
    });
    db.txOrderUpdateMany.mockResolvedValue({ count: 1 });
    db.txProductUpdateMany.mockResolvedValue({ count: 1 });
    db.txProductFindUnique.mockResolvedValue({ stock: 12 });
    db.txInventoryMovementCreate.mockResolvedValue({ id: "movement_1" });
    db.txFulfillmentEventCreate.mockResolvedValue({ id: "fulfillment_event_1" });

    const summary = await expireOverduePayments({ now });

    expect(summary).toEqual({ scanned: 1, expired: 1, failed: 0 });
    expect(db.paymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "PENDING", expiresAt: { lte: now } },
        take: 100,
      })
    );
    expect(db.txPaymentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "payment_1", status: "PENDING" },
        data: expect.objectContaining({
          status: "EXPIRED",
          transactionStatus: "expired_by_system",
          rawNotification: {
            source: "payment_expiry_sweep",
            expiredAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
            midtransOrderId: "BD-1",
          },
        }),
      })
    );
    expect(db.txOrderUpdate).toHaveBeenCalledWith({
      where: { id: "order_1" },
      data: { status: "EXPIRED" },
    });
    expect(db.txProductUpdateMany).toHaveBeenCalledWith({
      where: { id: "product_1", type: "PHYSICAL" },
      data: { stock: { increment: 2 } },
    });
    expect(db.txInventoryMovementCreate).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace_1",
        productId: "product_1",
        orderId: "order_1",
        actorId: null,
        type: "ORDER_RELEASE",
        quantityChange: 2,
        stockBefore: 10,
        stockAfter: 12,
        reason: "Released reserved stock for T-Shirt",
        metadata: {},
      },
    });
  });

  it("caps the sweep limit to keep each job bounded", async () => {
    db.paymentFindMany.mockResolvedValue([]);

    await expireOverduePayments({ limit: 10_000, now });

    expect(db.paymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 })
    );
  });
});

describe("expireOverduePayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.paymentFindFirst.mockResolvedValue({
      id: "payment_1",
      status: "PENDING",
      expiresAt,
      midtransOrderId: "BD-1",
    });
    // applyPaymentStatus wraps its work in one transaction; the unwind path
    // itself is already covered by the sweep tests above.
    db.transaction.mockResolvedValue({
      changed: true,
      payment: { id: "payment_1", status: "EXPIRED" },
      afterCommit: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("expires one overdue payment on demand", async () => {
    const result = await expireOverduePayment("payment_1", {
      workspaceId: "workspace_1",
      now,
    });

    expect(result).toEqual({ ok: true, changed: true });
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it("scopes the lookup to the caller's workspace", async () => {
    await expireOverduePayment("payment_1", { workspaceId: "workspace_1", now });

    expect(db.paymentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "payment_1", workspaceId: "workspace_1" },
      })
    );
  });

  it("refuses a payment that belongs to another workspace", async () => {
    db.paymentFindFirst.mockResolvedValue(null);

    const result = await expireOverduePayment("payment_1", {
      workspaceId: "workspace_2",
      now,
    });

    expect(result).toEqual({ ok: false, error: "Payment tidak ditemukan." });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("is a no-op when the payment already reached a final status", async () => {
    db.paymentFindFirst.mockResolvedValue({
      id: "payment_1",
      status: "PAID",
      expiresAt,
      midtransOrderId: "BD-1",
    });

    const result = await expireOverduePayment("payment_1", {
      workspaceId: "workspace_1",
      now,
    });

    expect(result).toEqual({ ok: false, error: "Payment ini sudah final." });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("refuses to expire a payment that still has time left", async () => {
    db.paymentFindFirst.mockResolvedValue({
      id: "payment_1",
      status: "PENDING",
      expiresAt: new Date("2026-09-09T02:00:00Z"),
      midtransOrderId: "BD-1",
    });

    const result = await expireOverduePayment("payment_1", {
      workspaceId: "workspace_1",
      now,
    });

    expect(result).toEqual({
      ok: false,
      error: "Payment ini belum melewati batas waktu.",
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("refuses a payment that never had a deadline", async () => {
    db.paymentFindFirst.mockResolvedValue({
      id: "payment_1",
      status: "PENDING",
      expiresAt: null,
      midtransOrderId: "BD-1",
    });

    const result = await expireOverduePayment("payment_1", {
      workspaceId: "workspace_1",
      now,
    });

    expect(result.ok).toBe(false);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("reports a transition failure instead of throwing at the caller", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.transaction.mockRejectedValue(new Error("deadlock"));

    const result = await expireOverduePayment("payment_1", {
      workspaceId: "workspace_1",
      now,
    });

    expect(result).toEqual({
      ok: false,
      error: "Gagal meng-expire payment ini.",
    });
  });
});
