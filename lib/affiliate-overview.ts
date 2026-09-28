import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Approved commissions that can go into a new payout: never batched, or left
 * behind by a batch that failed or was cancelled. Their old payout items stay
 * for audit until the commission is re-batched.
 */
export const UNBATCHED_COMMISSION: Prisma.CommissionWhereInput = {
  status: "APPROVED",
  OR: [
    { payoutItem: null },
    { payoutItem: { payout: { status: { in: ["FAILED", "CANCELLED"] } } } },
  ],
};

/** Badge counts for the affiliate section tabs: work waiting for the owner. */
export async function getAffiliateNavCounts(workspaceId: string) {
  const now = new Date();
  const [pendingAffiliates, pendingCommissions, eligible] = await Promise.all([
    prisma.affiliate.count({ where: { workspaceId, status: "PENDING" } }),
    prisma.commission.count({
      where: {
        workspaceId,
        status: "PENDING",
        OR: [{ availableAt: null }, { availableAt: { lte: now } }],
      },
    }),
    prisma.commission.groupBy({
      by: ["affiliateId"],
      where: { workspaceId, ...UNBATCHED_COMMISSION },
    }),
  ]);
  return {
    pendingAffiliates,
    /** Pending commissions past their refund hold, i.e. ready to approve. */
    pendingCommissions,
    /** Affiliates with an approved, unbatched balance. */
    eligiblePayouts: eligible.length,
  };
}
