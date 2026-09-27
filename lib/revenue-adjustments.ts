import "server-only";

import type { CommissionStatus, Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

type AdjustmentSummary = {
  ok: true;
  adjusted: number;
  amount: number;
};

type CommissionForAdjustment = {
  id: string;
  workspaceId: string;
  orderId: string | null;
  amount: number;
  originalAmount: number | null;
  adjustedAmount: number;
  status: CommissionStatus;
};

export async function adjustCommissionForRefund(
  tx: Tx,
  refundId: string
): Promise<AdjustmentSummary> {
  const refund = await tx.orderRefund.findUnique({
    where: { id: refundId },
    select: {
      id: true,
      workspaceId: true,
      orderId: true,
      amount: true,
      status: true,
      reason: true,
      order: {
        select: {
          total: true,
          commissions: {
            select: {
              id: true,
              workspaceId: true,
              orderId: true,
              amount: true,
              originalAmount: true,
              adjustedAmount: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!refund || refund.status !== "REFUNDED" || refund.amount <= 0) {
    return { ok: true, adjusted: 0, amount: 0 };
  }

  const refundableBase = Math.max(0, refund.order.total);
  if (refundableBase <= 0) return { ok: true, adjusted: 0, amount: 0 };

  let adjusted = 0;
  let amount = 0;
  for (const commission of refund.order.commissions) {
    const result = await applyCommissionAdjustment(tx, commission, {
      orderId: refund.orderId,
      refundId: refund.id,
      type: "ORDER_REFUND",
      amount: proportionalDeduction(commission, refund.amount, refundableBase),
      reason:
        refund.reason ??
        `Refund adjustment for order ${refund.orderId}`,
      metadata: {
        refundId: refund.id,
        refundAmount: refund.amount,
        orderTotal: refundableBase,
      },
    });
    if (result > 0) {
      adjusted += 1;
      amount += result;
    }
  }

  return { ok: true, adjusted, amount };
}

export async function reverseCommissionForOrderCancellation(
  tx: Tx,
  orderId: string
): Promise<AdjustmentSummary> {
  const commissions = await tx.commission.findMany({
    where: { orderId },
    select: {
      id: true,
      workspaceId: true,
      orderId: true,
      amount: true,
      originalAmount: true,
      adjustedAmount: true,
      status: true,
    },
  });

  let adjusted = 0;
  let amount = 0;
  for (const commission of commissions) {
    const result = await applyCommissionAdjustment(tx, commission, {
      orderId,
      refundId: null,
      type: "ORDER_CANCELLATION",
      amount: commission.amount,
      reason: `Order ${orderId} was cancelled before settlement.`,
      metadata: { orderId },
    });
    if (result > 0) {
      adjusted += 1;
      amount += result;
    }
  }

  return { ok: true, adjusted, amount };
}

async function applyCommissionAdjustment(
  tx: Tx,
  commission: CommissionForAdjustment,
  input: {
    orderId: string | null;
    refundId: string | null;
    type: "ORDER_REFUND" | "ORDER_CANCELLATION";
    amount: number;
    reason: string;
    metadata: Prisma.InputJsonValue;
  }
) {
  const deduction = Math.min(
    Math.max(0, Math.floor(input.amount)),
    Math.max(
      0,
      commission.status === "PAID"
        ? commission.amount - commission.adjustedAmount
        : commission.amount
    )
  );
  if (deduction <= 0) return 0;

  const existing = await tx.commissionAdjustment.findFirst({
    where: {
      commissionId: commission.id,
      ...(input.refundId
        ? { refundId: input.refundId }
        : { type: input.type, orderId: input.orderId }),
    },
    select: { id: true },
  });
  if (existing) return 0;

  const originalAmount =
    commission.originalAmount ??
    Math.max(0, commission.amount + commission.adjustedAmount);
  const paid = commission.status === "PAID";
  const nextAmount = paid ? commission.amount : Math.max(0, commission.amount - deduction);
  const reverseData =
    !paid && nextAmount === 0
      ? {
          status: "REVERSED" as CommissionStatus,
          reversedAt: new Date(),
          reversalReason: input.reason,
        }
      : {};

  await tx.commissionAdjustment.create({
    data: {
      workspaceId: commission.workspaceId,
      commissionId: commission.id,
      orderId: input.orderId,
      refundId: input.refundId,
      type: input.type,
      amount: deduction,
      reason: input.reason,
      metadata: input.metadata,
    },
  });

  await tx.commission.update({
    where: { id: commission.id },
    data: {
      originalAmount,
      adjustedAmount: { increment: deduction },
      ...(paid ? {} : { amount: nextAmount }),
      ...reverseData,
    },
  });

  // A paid payout is immutable: its commission stays PAID and this negative
  // adjustment is recovered from a future payout. An unsettled batch can
  // still be reduced before money leaves the business.
  if (commission.status === "PAYOUT_SCHEDULED") {
    const item = await tx.affiliatePayoutItem.findUnique({
      where: { commissionId: commission.id },
      include: { payout: { select: { id: true, status: true, amount: true, grossAmount: true } } },
    });
    if (item && (item.payout.status === "DRAFT" || item.payout.status === "PROCESSING")) {
      await tx.affiliatePayoutItem.update({
        where: { id: item.id },
        data: { amount: Math.max(0, item.amount - deduction) },
      });
      await tx.affiliatePayout.update({
        where: { id: item.payout.id },
        data: {
          amount: Math.max(0, item.payout.amount - deduction),
          grossAmount: Math.max(0, item.payout.grossAmount - deduction),
        },
      });
    }
  }

  return deduction;
}

function proportionalDeduction(
  commission: CommissionForAdjustment,
  refundAmount: number,
  orderTotal: number
) {
  const originalAmount =
    commission.originalAmount ??
    Math.max(0, commission.amount + commission.adjustedAmount);
  return Math.floor((originalAmount * Math.max(0, refundAmount)) / orderTotal);
}
