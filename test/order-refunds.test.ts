import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  transaction: vi.fn(),
  orderFindUnique: vi.fn(),
  orderRefundCreate: vi.fn(),
  orderRefundFindUnique: vi.fn(),
  orderRefundUpdate: vi.fn(),
  orderRefundUpdateMany: vi.fn(),
  productUpdateMany: vi.fn(),
  productFindUnique: vi.fn(),
  inventoryMovementCreate: vi.fn(),
}));
const queueRefundNotification = vi.hoisted(() => vi.fn());
const adjustCommissionForRefund = vi.hoisted(() => vi.fn());
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
    requestMidtransRefund: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: db.transaction,
    orderRefund: {
      findUnique: db.orderRefundFindUnique,
      update: db.orderRefundUpdate,
    },
    // No per-workspace override: the module falls back to the env keys.
    ecommerceSetting: { findUnique: async () => null },
  },
}));

vi.mock("@/lib/store-notifications", () => ({
  queueRefundNotification,
}));

vi.mock("@/lib/revenue-adjustments", () => ({
  adjustCommissionForRefund,
}));

vi.mock("@/lib/midtrans", () => midtrans);

import {
  createOrderRefund,
  processOrderRefundProvider,
  updateOrderRefundStatus,
} from "@/lib/order-refunds";

const now = new Date("2026-09-10T08:00:00Z");

describe("order refunds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.transaction.mockImplementation(async (callback) => callback(makeTx()));
    db.orderFindUnique.mockResolvedValue(order());
    db.orderRefundCreate.mockResolvedValue(refund());
    db.orderRefundFindUnique.mockResolvedValue(refund({ status: "APPROVED" }));
    db.orderRefundUpdate.mockResolvedValue({});
    db.orderRefundUpdateMany.mockResolvedValue({ count: 1 });
    db.productUpdateMany.mockResolvedValue({ count: 1 });
    db.productFindUnique.mockResolvedValue({ stock: 12 });
    db.inventoryMovementCreate.mockResolvedValue({ id: "movement_1" });
    queueRefundNotification.mockResolvedValue(undefined);
    adjustCommissionForRefund.mockResolvedValue({
      ok: true,
      adjusted: 1,
      amount: 20_000,
    });
    midtrans.requestMidtransRefund.mockResolvedValue({
      status_code: "200",
      status_message: "Success",
      transaction_status: "partial_refund",
      refund_chargeback_id: "chargeback_1",
      refund_key: "refund_refund_1",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records a refunded return, restocks physical items, and writes ledger movements", async () => {
    const result = await createOrderRefund("order_1", {
      workspaceId: "workspace_1",
      actorId: "user_1",
      type: "RETURN",
      status: "REFUNDED",
      amount: 200_000,
      reason: "Damaged item",
      returnToStock: true,
      items: [{ orderItemId: "item_1", quantity: 2, restockQuantity: 2 }],
      now,
    });

    expect(result).toEqual({
      ok: true,
      refundId: "refund_1",
      status: "REFUNDED",
    });
    expect(db.orderRefundCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace_1",
        orderId: "order_1",
        customerId: "customer_1",
        actorId: "user_1",
        type: "RETURN",
        status: "REFUNDED",
        amount: 200_000,
        reason: "Damaged item",
        returnToStock: true,
        approvedAt: now,
        refundedAt: now,
        items: {
          create: [
            {
              orderItemId: "item_1",
              productId: "product_1",
              quantity: 2,
              restockQuantity: 2,
            },
          ],
        },
      }),
      include: expect.any(Object),
    });
    expect(db.productUpdateMany).toHaveBeenCalledWith({
      where: { id: "product_1", type: "PHYSICAL" },
      data: { stock: { increment: 2 } },
    });
    expect(db.inventoryMovementCreate).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace_1",
        productId: "product_1",
        orderId: "order_1",
        actorId: "user_1",
        type: "ORDER_RETURN",
        quantityChange: 2,
        stockBefore: 10,
        stockAfter: 12,
        reason: "Damaged item",
        metadata: {
          refundId: "refund_1",
          orderItemId: "item_1",
        },
      },
    });
    expect(db.orderRefundUpdate).toHaveBeenCalledWith({
      where: { id: "refund_1" },
      data: { restockedAt: now },
    });
    expect(adjustCommissionForRefund).toHaveBeenCalledWith(
      expect.any(Object),
      "refund_1"
    );
    expect(queueRefundNotification).toHaveBeenCalledWith(
      expect.any(Object),
      "refund_1",
      "REFUND_REFUNDED"
    );
  });

  it("rejects refund item quantities that exceed the remaining purchased quantity", async () => {
    db.orderFindUnique.mockResolvedValue(
      order({
        items: [
          {
            id: "item_1",
            productId: "product_1",
            nameSnapshot: "T-Shirt",
            quantity: 2,
            product: { type: "PHYSICAL" },
            refundItems: [
              {
                quantity: 1,
                restockQuantity: 1,
                refund: { status: "REQUESTED" },
              },
            ],
          },
        ],
      })
    );

    const result = await createOrderRefund("order_1", {
      workspaceId: "workspace_1",
      amount: 100_000,
      returnToStock: true,
      items: [{ orderItemId: "item_1", quantity: 2, restockQuantity: 2 }],
      now,
    });

    expect(result).toEqual({
      ok: false,
      error: '"T-Shirt" only has 1 refundable item(s) left.',
    });
    expect(db.orderRefundCreate).not.toHaveBeenCalled();
    expect(db.productUpdateMany).not.toHaveBeenCalled();
  });

  it("restocks pending return items when the refund is marked refunded", async () => {
    const result = await updateOrderRefundStatus("refund_1", {
      workspaceId: "workspace_1",
      actorId: "user_1",
      status: "REFUNDED",
      now,
    });

    expect(result).toEqual({
      ok: true,
      refundId: "refund_1",
      orderId: "order_1",
      status: "REFUNDED",
    });
    expect(db.orderRefundUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "refund_1",
        returnToStock: true,
        restockedAt: null,
      },
      data: { restockedAt: now },
    });
    expect(db.productUpdateMany).toHaveBeenCalledWith({
      where: { id: "product_1", type: "PHYSICAL" },
      data: { stock: { increment: 2 } },
    });
    expect(db.orderRefundUpdate).toHaveBeenCalledWith({
      where: { id: "refund_1" },
      data: expect.objectContaining({
        status: "REFUNDED",
        approvedAt: now,
        refundedAt: now,
      }),
    });
    expect(adjustCommissionForRefund).toHaveBeenCalledWith(
      expect.any(Object),
      "refund_1"
    );
    expect(queueRefundNotification).toHaveBeenCalledWith(
      expect.any(Object),
      "refund_1",
      "REFUND_REFUNDED"
    );
  });

  it("processes an approved Midtrans refund before marking it refunded", async () => {
    db.orderRefundFindUnique
      .mockResolvedValueOnce(refundForProvider())
      .mockResolvedValueOnce(refund({ status: "APPROVED" }));

    const result = await processOrderRefundProvider("refund_1", {
      workspaceId: "workspace_1",
      actorId: "user_1",
      now,
    });

    expect(result).toEqual({
      ok: true,
      refundId: "refund_1",
      orderId: "order_1",
      status: "REFUNDED",
    });
    expect(midtrans.requestMidtransRefund).toHaveBeenCalledWith(
      {
        transactionRef: "txn_1",
        refundKey: "refund_refund_1",
        amount: 200_000,
        reason: "Damaged item",
        direct: undefined,
      },
      // The workspace's own Midtrans credentials; null falls back to env.
      null
    );
    expect(db.orderRefundUpdate).toHaveBeenCalledWith({
      where: { id: "refund_1" },
      data: expect.objectContaining({
        status: "REFUNDED",
        provider: "midtrans",
        providerRefundKey: "refund_refund_1",
        providerStatus: "partial_refund",
        providerReference: "chargeback_1",
        providerRequestedAt: now,
      }),
    });
  });
});

function makeTx() {
  return {
    order: {
      findUnique: db.orderFindUnique,
    },
    orderRefund: {
      create: db.orderRefundCreate,
      findUnique: db.orderRefundFindUnique,
      update: db.orderRefundUpdate,
      updateMany: db.orderRefundUpdateMany,
    },
    product: {
      updateMany: db.productUpdateMany,
      findUnique: db.productFindUnique,
    },
    inventoryMovement: {
      create: db.inventoryMovementCreate,
    },
  };
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "order_1",
    workspaceId: "workspace_1",
    customerId: "customer_1",
    orderNumber: "ORD-1",
    total: 200_000,
    refunds: [],
    items: [
      {
        id: "item_1",
        productId: "product_1",
        nameSnapshot: "T-Shirt",
        quantity: 2,
        product: { type: "PHYSICAL" },
        refundItems: [],
      },
    ],
    ...overrides,
  };
}

function refund(overrides: Record<string, unknown> = {}) {
  return {
    id: "refund_1",
    workspaceId: "workspace_1",
    orderId: "order_1",
    reason: "Damaged item",
    amount: 200_000,
    provider: "manual",
    providerRefundKey: null,
    providerReference: null,
    providerStatus: null,
    providerRequestedAt: null,
    status: "APPROVED",
    returnToStock: true,
    restockedAt: null,
    approvedAt: null,
    rejectedAt: null,
    refundedAt: null,
    cancelledAt: null,
    order: { orderNumber: "ORD-1" },
    items: [
      {
        id: "refund_item_1",
        orderItemId: "item_1",
        productId: "product_1",
        quantity: 2,
        restockQuantity: 2,
        orderItem: { nameSnapshot: "T-Shirt" },
        product: { type: "PHYSICAL" },
      },
    ],
    ...overrides,
  };
}

function refundForProvider(overrides: Record<string, unknown> = {}) {
  return {
    id: "refund_1",
    workspaceId: "workspace_1",
    orderId: "order_1",
    reason: "Damaged item",
    amount: 200_000,
    status: "APPROVED",
    providerRefundKey: null,
    providerReference: null,
    order: {
      orderNumber: "ORD-1",
      payment: {
        status: "PAID",
        provider: "midtrans",
        midtransOrderId: "BD-1",
        transactionId: "txn_1",
        transactionStatus: "settlement",
        paymentType: "gopay",
      },
    },
    ...overrides,
  };
}
