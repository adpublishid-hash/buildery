import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  transaction: vi.fn(),
  paymentFindUnique: vi.fn(),
  paymentUpdate: vi.fn(),
  paymentUpdateMany: vi.fn(),
  paymentFindUniqueOrThrow: vi.fn(),
  orderFindUnique: vi.fn(),
  orderUpdate: vi.fn(),
  orderUpdateMany: vi.fn(),
  productUpdateMany: vi.fn(),
  productFindUnique: vi.fn(),
  inventoryMovementCreate: vi.fn(),
  fulfillmentEventCreate: vi.fn(),
  membershipPlanFindMany: vi.fn(),
  customerMembershipUpsert: vi.fn(),
  abandonedRecoveryUpdateMany: vi.fn(),
  affiliateFindUnique: vi.fn(),
  referralCreate: vi.fn(),
  commissionCreate: vi.fn(),
  executeRaw: vi.fn(),
}));

const sendWorkspaceMetaEvent = vi.hoisted(() => vi.fn());
const queueOrderNotifications = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: db.transaction,
  },
}));

vi.mock("@/lib/meta-capi", () => ({
  sendWorkspaceMetaEvent,
}));

vi.mock("@/lib/store-notifications", () => ({
  queueOrderNotifications,
}));

import { applyPaymentStatus } from "@/lib/payments";

describe("payment stock reservation transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.transaction.mockImplementation(async (callback) => callback(makeTx()));
    db.paymentUpdate.mockResolvedValue({
      ...payment(),
      transactionStatus: "pending",
    });
    db.paymentUpdateMany.mockResolvedValue({ count: 1 });
    db.orderUpdate.mockResolvedValue({});
    db.orderUpdateMany.mockResolvedValue({ count: 1 });
    db.productUpdateMany.mockResolvedValue({ count: 1 });
    db.productFindUnique.mockResolvedValue({
      workspaceId: "workspace_1",
      stock: 8,
    });
    db.inventoryMovementCreate.mockResolvedValue({ id: "movement_1" });
    db.fulfillmentEventCreate.mockResolvedValue({ id: "fulfillment_event_1" });
    db.membershipPlanFindMany.mockResolvedValue([]);
    db.affiliateFindUnique.mockResolvedValue(null);
    db.abandonedRecoveryUpdateMany.mockResolvedValue({ count: 0 });
    queueOrderNotifications.mockResolvedValue(undefined);
    sendWorkspaceMetaEvent.mockResolvedValue({ queued: true, id: "meta_1" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not decrement stock again when a paid order already reserved it", async () => {
    db.paymentFindUnique.mockResolvedValue(payment());
    db.orderFindUnique.mockResolvedValue(order({ stockReservedAt: new Date() }));

    const result = await applyPaymentStatus("payment_1", "PAID");

    expect(result.changed).toBe(true);
    expect(db.orderUpdateMany).toHaveBeenCalledWith({
      where: { id: "order_1", status: { not: "PAID" } },
      data: { status: "PAID" },
    });
    expect(db.productUpdateMany).not.toHaveBeenCalled();
  });

  it("still decrements stock for legacy paid orders without a reservation", async () => {
    db.paymentFindUnique.mockResolvedValue(payment());
    db.orderFindUnique.mockResolvedValue(order({ stockReservedAt: null }));

    await applyPaymentStatus("payment_1", "PAID");

    expect(db.productUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "product_1",
        type: "PHYSICAL",
        stock: { gte: 2 },
      },
      data: { stock: { decrement: 2 } },
    });
    expect(db.inventoryMovementCreate).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace_1",
        productId: "product_1",
        orderId: "order_1",
        actorId: null,
        type: "ORDER_FULFILLMENT",
        quantityChange: -2,
        stockBefore: 10,
        stockAfter: 8,
        reason: "Payment captured for order ORD-1",
        metadata: {},
      },
    });
  });

  it("releases reserved stock when payment expires", async () => {
    db.paymentFindUnique.mockResolvedValue(payment());
    db.orderFindUnique.mockResolvedValue(
      order({ stockReservedAt: new Date(), stockReleasedAt: null })
    );

    await applyPaymentStatus("payment_1", "EXPIRED");

    expect(db.orderUpdate).toHaveBeenCalledWith({
      where: { id: "order_1" },
      data: { status: "EXPIRED" },
    });
    expect(db.orderUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "order_1",
        stockReservedAt: { not: null },
        stockReleasedAt: null,
      },
      data: { stockReleasedAt: expect.any(Date) },
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
        actorId: null,
        type: "ORDER_RELEASE",
        quantityChange: 2,
        stockBefore: 6,
        stockAfter: 8,
        reason: "Released reserved stock for T-Shirt",
        metadata: {},
      },
    });
  });

  it("updates pending metadata without reporting a terminal transition", async () => {
    db.paymentFindUnique.mockResolvedValue(payment());

    const result = await applyPaymentStatus("payment_1", "PENDING", {
      transactionStatus: "pending",
      paymentType: "bank_transfer",
    });

    expect(result.changed).toBe(false);
    expect(db.paymentUpdate).toHaveBeenCalledWith({
      where: { id: "payment_1" },
      data: expect.objectContaining({
        transactionStatus: "pending",
        paymentType: "bank_transfer",
      }),
    });
    expect(db.orderFindUnique).not.toHaveBeenCalled();
    expect(db.paymentUpdateMany).not.toHaveBeenCalled();
  });
});

function makeTx() {
  return {
    payment: {
      findUnique: db.paymentFindUnique,
      update: db.paymentUpdate,
      updateMany: db.paymentUpdateMany,
      findUniqueOrThrow: db.paymentFindUniqueOrThrow,
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
    membershipPlan: {
      findMany: db.membershipPlanFindMany,
    },
    customerMembership: {
      upsert: db.customerMembershipUpsert,
    },
    abandonedCheckoutRecovery: {
      updateMany: db.abandonedRecoveryUpdateMany,
    },
    affiliate: {
      findUnique: db.affiliateFindUnique,
    },
    referral: {
      create: db.referralCreate,
    },
    commission: {
      create: db.commissionCreate,
    },
    $executeRaw: db.executeRaw,
  };
}

function payment() {
  return {
    id: "payment_1",
    status: "PENDING",
    kind: "ORDER",
    amount: 200_000,
    midtransOrderId: "BD-1",
    orderId: "order_1",
    enrollmentId: null,
    customerMembershipId: null,
    transactionId: null,
    transactionStatus: null,
    paymentType: null,
    fraudStatus: null,
    paidAt: null,
  };
}

function order({
  stockReservedAt,
  stockReleasedAt = null,
}: {
  stockReservedAt: Date | null;
  stockReleasedAt?: Date | null;
}) {
  return {
    id: "order_1",
    workspaceId: "workspace_1",
    orderNumber: "ORD-1",
    status: "PENDING",
    total: 200_000,
    couponId: null,
    customerId: null,
    referralAffiliateId: null,
    stockReservedAt,
    stockReleasedAt,
    fulfillmentStatus: "UNFULFILLED",
    workspace: { slug: "demo" },
    customer: null,
    items: [
      {
        id: "item_1",
        productId: "product_1",
        nameSnapshot: "T-Shirt",
        unitPrice: 100_000,
        quantity: 2,
        product: { type: "PHYSICAL" },
      },
    ],
  };
}
