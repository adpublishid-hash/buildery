import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  adjustCommissionForRefund,
  reverseCommissionForOrderCancellation,
} from "@/lib/revenue-adjustments";

const tx = {
  orderRefund: { findUnique: vi.fn() },
  commission: { findMany: vi.fn(), update: vi.fn() },
  commissionAdjustment: { findFirst: vi.fn(), create: vi.fn() },
};

describe("revenue adjustments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.commissionAdjustment.findFirst.mockResolvedValue(null);
    tx.commissionAdjustment.create.mockResolvedValue({ id: "adjustment_1" });
    tx.commission.update.mockResolvedValue({});
  });

  it("deducts commission proportionally when a refund is settled", async () => {
    tx.orderRefund.findUnique.mockResolvedValue(
      refundedOrder({
        refundAmount: 100_000,
        orderTotal: 200_000,
        commissionAmount: 20_000,
      })
    );

    const result = await adjustCommissionForRefund(tx as never, "refund_1");

    expect(result).toEqual({ ok: true, adjusted: 1, amount: 10_000 });
    expect(tx.commissionAdjustment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        commissionId: "commission_1",
        refundId: "refund_1",
        type: "ORDER_REFUND",
        amount: 10_000,
      }),
    });
    expect(tx.commission.update).toHaveBeenCalledWith({
      where: { id: "commission_1" },
      data: expect.objectContaining({
        originalAmount: 20_000,
        adjustedAmount: { increment: 10_000 },
        amount: 10_000,
      }),
    });
  });

  it("skips duplicate refund adjustments", async () => {
    tx.orderRefund.findUnique.mockResolvedValue(refundedOrder({}));
    tx.commissionAdjustment.findFirst.mockResolvedValue({ id: "existing" });

    const result = await adjustCommissionForRefund(tx as never, "refund_1");

    expect(result).toEqual({ ok: true, adjusted: 0, amount: 0 });
    expect(tx.commissionAdjustment.create).not.toHaveBeenCalled();
    expect(tx.commission.update).not.toHaveBeenCalled();
  });

  it("reverses the remaining commission amount when an order is cancelled", async () => {
    tx.commission.findMany.mockResolvedValue([
      commission({ amount: 12_000, originalAmount: 20_000, adjustedAmount: 8_000 }),
    ]);

    const result = await reverseCommissionForOrderCancellation(
      tx as never,
      "order_1"
    );

    expect(result).toEqual({ ok: true, adjusted: 1, amount: 12_000 });
    expect(tx.commissionAdjustment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        commissionId: "commission_1",
        orderId: "order_1",
        refundId: null,
        type: "ORDER_CANCELLATION",
        amount: 12_000,
      }),
    });
    expect(tx.commission.update).toHaveBeenCalledWith({
      where: { id: "commission_1" },
      data: expect.objectContaining({
        amount: 0,
        status: "REVERSED",
        adjustedAmount: { increment: 12_000 },
      }),
    });
  });

  it("keeps a paid commission immutable and records a future clawback", async () => {
    tx.orderRefund.findUnique.mockResolvedValue({
      ...refundedOrder({ refundAmount: 100_000, orderTotal: 200_000, commissionAmount: 20_000 }),
      order: {
        total: 200_000,
        commissions: [{ ...commission({ amount: 20_000 }), status: "PAID" }],
      },
    });

    await adjustCommissionForRefund(tx as never, "refund_1");

    expect(tx.commission.update).toHaveBeenCalledWith({
      where: { id: "commission_1" },
      data: expect.not.objectContaining({ amount: expect.anything() }),
    });
    expect(tx.commission.update).toHaveBeenCalledWith({
      where: { id: "commission_1" },
      data: expect.objectContaining({
        adjustedAmount: { increment: 10_000 },
      }),
    });
  });
});

function refundedOrder({
  refundAmount = 100_000,
  orderTotal = 200_000,
  commissionAmount = 20_000,
}: {
  refundAmount?: number;
  orderTotal?: number;
  commissionAmount?: number;
}) {
  return {
    id: "refund_1",
    workspaceId: "workspace_1",
    orderId: "order_1",
    amount: refundAmount,
    status: "REFUNDED",
    reason: "Customer return",
    order: {
      total: orderTotal,
      commissions: [commission({ amount: commissionAmount })],
    },
  };
}

function commission({
  amount = 20_000,
  originalAmount = null,
  adjustedAmount = 0,
}: {
  amount?: number;
  originalAmount?: number | null;
  adjustedAmount?: number;
}) {
  return {
    id: "commission_1",
    workspaceId: "workspace_1",
    orderId: "order_1",
    amount,
    originalAmount,
    adjustedAmount,
    status: "PENDING",
  };
}
