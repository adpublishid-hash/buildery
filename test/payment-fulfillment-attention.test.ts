import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Once a payment is captured the order is PAID, and nothing afterwards may
 * throw.
 *
 * It used to: if the coupon's last slot went to someone else, or stock ran out,
 * between checkout and the gateway's callback, `fulfillOrder` threw. The throw
 * rolled back the same transaction that had just set PAID, so the provider kept
 * the buyer's money, the order stayed PENDING, and the webhook answered 500 —
 * which made the gateway retry the identical failure forever.
 */

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
  variantUpdateMany: vi.fn(),
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
const sendWorkspaceTelegramMessage = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: db.transaction } }));
vi.mock("@/lib/meta-capi", () => ({ sendWorkspaceMetaEvent }));
vi.mock("@/lib/store-notifications", () => ({ queueOrderNotifications }));
vi.mock("@/lib/telegram", () => ({ sendWorkspaceTelegramMessage }));

import { applyPaymentStatus } from "@/lib/payments";

describe("fulfilment problems after a captured payment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.transaction.mockImplementation(async (callback) => callback(makeTx()));
    db.paymentUpdate.mockResolvedValue({ ...payment(), transactionStatus: "settlement" });
    db.paymentUpdateMany.mockResolvedValue({ count: 1 });
    db.orderUpdate.mockResolvedValue({});
    db.orderUpdateMany.mockResolvedValue({ count: 1 });
    db.productUpdateMany.mockResolvedValue({ count: 1 });
    db.variantUpdateMany.mockResolvedValue({ count: 1 });
    db.productFindUnique.mockResolvedValue({ workspaceId: "workspace_1", stock: 8 });
    db.inventoryMovementCreate.mockResolvedValue({ id: "movement_1" });
    db.fulfillmentEventCreate.mockResolvedValue({ id: "fulfillment_event_1" });
    db.membershipPlanFindMany.mockResolvedValue([]);
    db.affiliateFindUnique.mockResolvedValue(null);
    db.abandonedRecoveryUpdateMany.mockResolvedValue({ count: 0 });
    db.executeRaw.mockResolvedValue(1);
    queueOrderNotifications.mockResolvedValue(undefined);
    sendWorkspaceMetaEvent.mockResolvedValue({ queued: true, id: "meta_1" });
    sendWorkspaceTelegramMessage.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the order paid when the coupon's last slot is gone", async () => {
    db.paymentFindUnique.mockResolvedValue(payment());
    db.orderFindUnique.mockResolvedValue(
      order({ stockReservedAt: new Date(), couponId: "coupon_1" })
    );
    // The guarded UPDATE matched nothing: someone else took the last use.
    db.executeRaw.mockResolvedValue(0);

    const result = await applyPaymentStatus("payment_1", "PAID");

    expect(result.changed).toBe(true);
    expect(db.orderUpdateMany).toHaveBeenCalledWith({
      where: { id: "order_1", status: { not: "PAID" } },
      data: { status: "PAID" },
    });
    expect(db.orderUpdate).toHaveBeenCalledWith({
      where: { id: "order_1" },
      data: {
        needsAttention: true,
        attentionReason: expect.stringContaining("kupon"),
      },
    });
  });

  it("keeps the order paid when a legacy order's stock ran out", async () => {
    db.paymentFindUnique.mockResolvedValue(payment());
    db.orderFindUnique.mockResolvedValue(order({ stockReservedAt: null }));
    db.productUpdateMany.mockResolvedValue({ count: 0 });

    const result = await applyPaymentStatus("payment_1", "PAID");

    expect(result.changed).toBe(true);
    expect(db.orderUpdate).toHaveBeenCalledWith({
      where: { id: "order_1" },
      data: {
        needsAttention: true,
        attentionReason: expect.stringContaining("Stok"),
      },
    });
    // No stock movement is invented for a decrement that did not happen.
    expect(db.inventoryMovementCreate).not.toHaveBeenCalled();
  });

  it("tells the team, after the transaction, that a paid order needs a look", async () => {
    db.paymentFindUnique.mockResolvedValue(payment());
    db.orderFindUnique.mockResolvedValue(
      order({ stockReservedAt: new Date(), couponId: "coupon_1" })
    );
    db.executeRaw.mockResolvedValue(0);

    await applyPaymentStatus("payment_1", "PAID");

    expect(sendWorkspaceTelegramMessage).toHaveBeenCalledWith(
      "workspace_1",
      expect.stringContaining("ORD-1")
    );
  });

  it("leaves a clean order unflagged", async () => {
    db.paymentFindUnique.mockResolvedValue(payment());
    db.orderFindUnique.mockResolvedValue(order({ stockReservedAt: new Date() }));

    await applyPaymentStatus("payment_1", "PAID");

    const flagged = db.orderUpdate.mock.calls.some(
      ([args]) => args?.data?.needsAttention === true
    );
    expect(flagged).toBe(false);
    expect(sendWorkspaceTelegramMessage).not.toHaveBeenCalled();
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
    product: { updateMany: db.productUpdateMany, findUnique: db.productFindUnique },
    productVariant: { updateMany: db.variantUpdateMany },
    inventoryMovement: { create: db.inventoryMovementCreate },
    fulfillmentEvent: { create: db.fulfillmentEventCreate },
    membershipPlan: { findMany: db.membershipPlanFindMany },
    customerMembership: { upsert: db.customerMembershipUpsert },
    abandonedCheckoutRecovery: { updateMany: db.abandonedRecoveryUpdateMany },
    affiliate: { findUnique: db.affiliateFindUnique },
    referral: { create: db.referralCreate },
    commission: { create: db.commissionCreate },
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
  couponId = null,
}: {
  stockReservedAt: Date | null;
  couponId?: string | null;
}) {
  return {
    id: "order_1",
    workspaceId: "workspace_1",
    orderNumber: "ORD-1",
    status: "PENDING",
    total: 200_000,
    couponId,
    customerId: null,
    referralAffiliateId: null,
    stockReservedAt,
    stockReleasedAt: null,
    fulfillmentStatus: "UNFULFILLED",
    workspace: { slug: "demo" },
    customer: null,
    items: [
      {
        id: "item_1",
        productId: "product_1",
        variantId: null,
        nameSnapshot: "T-Shirt",
        unitPrice: 100_000,
        quantity: 2,
        product: { type: "PHYSICAL" },
      },
    ],
  };
}
