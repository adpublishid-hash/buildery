import "server-only";

import type { CommissionSourceType, Prisma, PrismaClient } from "@prisma/client";
import { queueAffiliateEmailNotification } from "@/lib/store-notifications";

type Tx = Prisma.TransactionClient | PrismaClient;

type CommissionInput = {
  workspaceId: string;
  affiliateId: string | null | undefined;
  sourceType: CommissionSourceType;
  sourceId: string;
  sourceLabel: string;
  basisAmount: number;
  purchaserCustomerId?: string | null;
  purchaserEmail?: string | null;
  orderId?: string | null;
};

/**
 * Creates an idempotent commission from a validated revenue source.
 * Tenant and self-referral checks run again here because payment webhooks may
 * arrive long after the browser attribution was captured.
 */
export async function createAffiliateCommission(tx: Tx, input: CommissionInput) {
  if (!input.affiliateId || input.basisAmount <= 0) return null;
  const affiliate = await tx.affiliate.findFirst({
    where: {
      id: input.affiliateId,
      workspaceId: input.workspaceId,
      status: "ACTIVE",
      archivedAt: null,
      program: { workspaceId: input.workspaceId },
    },
    include: {
      customer: { select: { id: true, email: true } },
      program: true,
    },
  });
  if (!affiliate) return null;

  const buyerEmail = input.purchaserEmail?.trim().toLowerCase();
  const isSelfReferral =
    affiliate.customerId === input.purchaserCustomerId ||
    Boolean(buyerEmail && affiliate.customer.email.toLowerCase() === buyerEmail);
  if (isSelfReferral && !affiliate.program.allowSelfReferral) return null;

  const sourceKey = `${input.sourceType.toLowerCase()}:${input.sourceId}`;
  const existing = await tx.commission.findUnique({ where: { sourceKey } });
  if (existing) return existing;
  const basisAmount = Math.max(0, Math.floor(input.basisAmount));
  const percent = affiliate.program.commissionPercent;
  const rateBps = percent * 100;
  const amount = Math.floor((basisAmount * rateBps) / 10_000);
  if (amount <= 0) return null;
  const availableAt = new Date(
    Date.now() + Math.max(0, affiliate.program.holdDays) * 24 * 60 * 60 * 1000
  );

  const commission = await tx.commission.upsert({
    where: { sourceKey },
    update: {},
    create: {
      affiliateId: affiliate.id,
      workspaceId: input.workspaceId,
      orderId: input.orderId ?? null,
      sourceType: input.sourceType,
      sourceKey,
      sourceLabel: input.sourceLabel,
      basisAmount,
      rateBps,
      percent,
      amount,
      originalAmount: amount,
      availableAt,
    },
  });

  await tx.referral.upsert({
    where: { dedupeKey: `sale:${sourceKey}` },
    update: {},
    create: {
      affiliateId: affiliate.id,
      workspaceId: input.workspaceId,
      orderId: input.orderId ?? null,
      event: "SALE",
      dedupeKey: `sale:${sourceKey}`,
    },
  });
  await queueAffiliateEmailNotification(tx, {
    workspaceId: input.workspaceId,
    customerId: affiliate.customerId,
    recipient: affiliate.customer.email,
    event: "AFFILIATE_SALE",
    subject: "New affiliate commission",
    body: `A new ${input.sourceLabel} sale generated a commission of Rp${amount.toLocaleString("id-ID")}. It will be eligible after the refund hold period.`,
  });
  return commission;
}

export function orderCommissionBasis(order: {
  subtotal: number;
  discount: number;
  shippingCost: number;
  codFee: number;
  taxAmount: number;
  total: number;
}, options: {
  includeShipping: boolean;
  includeTax: boolean;
  includeFees: boolean;
}) {
  const merchandise = Math.max(order.subtotal - order.discount, 0);
  const extraTax = Math.max(
    order.total - merchandise - order.shippingCost - order.codFee,
    0
  );
  return merchandise +
    (options.includeShipping ? order.shippingCost : 0) +
    (options.includeFees ? order.codFee : 0) +
    (options.includeTax ? Math.min(order.taxAmount, extraTax) : 0);
}
