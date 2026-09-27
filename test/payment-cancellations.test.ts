import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  transaction: vi.fn(),
  paymentFindFirst: vi.fn(),
  paymentFindUnique: vi.fn(),
  paymentUpdate: vi.fn(),
  paymentUpdateMany: vi.fn(),
  orderFindUnique: vi.fn(),
  orderUpdate: vi.fn(),
  orderUpdateMany: vi.fn(),
  productUpdateMany: vi.fn(),
  productFindUnique: vi.fn(),
  inventoryMovementCreate: vi.fn(),
  fulfillmentEventCreate: vi.fn(),
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
    MidtransApiError,
    requestMidtransCancel: vi.fn(),
  };
});
const queueOrderNotifications = vi.hoisted(() => vi.fn());
const reverseCommissionForOrderCancellation = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    payment: {
      findFirst: db.paymentFindFirst,
      update: db.paymentUpdate,
    },
    // No per-workspace override: the module falls back to the env keys.
    ecommerceSetting: { findUnique: async () => null },
    $transaction: db.transaction,
  },
}));

vi.mock("@/lib/midtrans", () => midtrans);

vi.mock("@/lib/store-notifications", () => ({
  queueOrderNotifications,
}));

vi.mock("@/lib/revenue-adjustments", () => ({
  reverseCommissionForOrderCancellation,
}));

import { cancelMidtransOrderPayment } from "@/lib/payment-cancellations";

const now = new Date("2026-09-10T09:00:00Z");
const reservedAt = new Date("2026-09-10T08:00:00Z");

describe("payment cancellations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.transaction.mockImplementation(async (callback) => callback(makeTx()));
    db.paymentFindFirst.mockResolvedValue(payment({ status: "PENDING" }));
    db.paymentFindUnique.mockResolvedValue(
      payment({
        status: "PENDING",
        order: order({ stockReservedAt: reservedAt }),
      })
    );
    db.paymentUpdateMany.mockResolvedValue({ count: 1 });
    db.orderUpdate.mockResolvedValue({});
    db.orderUpdateMany.mockResolvedValue({ count: 1 });
    db.orderFindUnique.mockResolvedValue(releaseOrder());
    db.productUpdateMany.mockResolvedValue({ count: 1 });
    db.productFindUnique.mockResolvedValue({ stock: 12 });
    db.inventoryMovementCreate.mockResolvedValue({ id: "movement_1" });
    db.fulfillmentEventCreate.mockResolvedValue({ id: "fulfillment_1" });
    db.paymentUpdate.mockResolvedValue({});
    queueOrderNotifications.mockResolvedValue(undefined);
    reverseCommissionForOrderCancellation.mockResolvedValue({
      ok: true,
      adjusted: 1,
      amount: 20_000,
    });
    midtrans.requestMidtransCancel.mockResolvedValue({
      status_code: "200",
      status_message: "Success, transaction is canceled",
      transaction_id: "txn_1",
      order_id: "BD-1",
      payment_type: "bank_transfer",
      transaction_status: "cancel",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cancels a pending Midtrans order and releases reserved stock", async () => {
    const result = await cancelMidtransOrderPayment("order_1", {
      workspaceId: "workspace_1",
      actorId: "user_1",
      now,
    });

    expect(result).toEqual({
      ok: true,
      paymentId: "payment_1",
      orderId: "order_1",
      status: "CANCELLED",
    });
    // Second argument is the workspace's Midtrans config; null uses env.
    expect(midtrans.requestMidtransCancel).toHaveBeenCalledWith("txn_1", null);
    expect(db.paymentUpdateMany).toHaveBeenCalledWith({
      where: { id: "payment_1", status: { in: ["PENDING", "PAID"] } },
      data: expect.objectContaining({
        status: "CANCELLED",
        transactionStatus: "cancel",
        providerCancelStatus: "cancel",
        providerCancelReference: "txn_1",
        providerCancelRequestedAt: now,
      }),
    });
    expect(db.orderUpdate).toHaveBeenCalledWith({
      where: { id: "order_1" },
      data: { status: "CANCELLED" },
    });
    expect(db.orderUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "order_1",
        stockReservedAt: { not: null },
        stockReleasedAt: null,
      },
      data: { stockReleasedAt: expect.any(Date) },
    });
    expect(db.inventoryMovementCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace_1",
        productId: "product_1",
        orderId: "order_1",
        type: "ORDER_RELEASE",
        quantityChange: 2,
      }),
    });
    expect(queueOrderNotifications).toHaveBeenCalledWith(
      expect.any(Object),
      "order_1",
      "PAYMENT_CANCELLED"
    );
    expect(reverseCommissionForOrderCancellation).toHaveBeenCalledWith(
      expect.any(Object),
      "order_1"
    );
  });

  it("restores paid legacy stock when a captured transaction is voided", async () => {
    db.paymentFindFirst.mockResolvedValue(
      payment({ status: "PAID", transactionStatus: "capture" })
    );
    db.paymentFindUnique.mockResolvedValue(
      payment({
        status: "PAID",
        transactionStatus: "capture",
        order: order({ stockReservedAt: null }),
      })
    );

    await cancelMidtransOrderPayment("order_1", {
      workspaceId: "workspace_1",
      actorId: "user_1",
      now,
    });

    expect(db.productUpdateMany).toHaveBeenCalledWith({
      where: { id: "product_1", type: "PHYSICAL" },
      data: { stock: { increment: 2 } },
    });
    expect(db.inventoryMovementCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace_1",
        productId: "product_1",
        orderId: "order_1",
        actorId: "user_1",
        type: "ORDER_CANCELLATION",
        quantityChange: 2,
        stockBefore: 10,
        stockAfter: 12,
      }),
    });
  });

  it("rejects settled payments and leaves Midtrans untouched", async () => {
    db.paymentFindFirst.mockResolvedValue(
      payment({ status: "PAID", transactionStatus: "settlement" })
    );

    const result = await cancelMidtransOrderPayment("order_1", {
      workspaceId: "workspace_1",
      now,
    });

    expect(result).toEqual({
      ok: false,
      error:
        "Settled Midtrans payments must be handled with refund/return instead.",
    });
    expect(midtrans.requestMidtransCancel).not.toHaveBeenCalled();
  });
});

function makeTx() {
  return {
    payment: {
      findUnique: db.paymentFindUnique,
      updateMany: db.paymentUpdateMany,
    },
    order: {
      findUnique: db.orderFindUnique,
      update: db.orderUpdate,
      updateMany: db.orderUpdateMany,
    },
    product: {
      updateMany: db.productUpdateMany,
      findUnique: db.productFindUnique,
    },
    inventoryMovement: {
      create: db.inventoryMovementCreate,
    },
    fulfillmentEvent: {
      create: db.fulfillmentEventCreate,
    },
  };
}

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: "payment_1",
    workspaceId: "workspace_1",
    kind: "ORDER",
    status: "PENDING",
    provider: "midtrans",
    midtransOrderId: "BD-1",
    transactionId: "txn_1",
    transactionStatus: "pending",
    paymentType: "bank_transfer",
    fraudStatus: null,
    orderId: "order_1",
    ...overrides,
  };
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "order_1",
    workspaceId: "workspace_1",
    orderNumber: "ORD-1",
    status: "PENDING",
    fulfillmentStatus: "UNFULFILLED",
    stockReservedAt: reservedAt,
    stockReleasedAt: null,
    items: [
      {
        productId: "product_1",
        nameSnapshot: "T-Shirt",
        quantity: 2,
        product: { type: "PHYSICAL" },
      },
    ],
    ...overrides,
  };
}

function releaseOrder() {
  return {
    id: "order_1",
    workspaceId: "workspace_1",
    stockReservedAt: reservedAt,
    stockReleasedAt: null,
    items: [
      {
        productId: "product_1",
        nameSnapshot: "T-Shirt",
        quantity: 2,
        product: { type: "PHYSICAL" },
      },
    ],
  };
}
