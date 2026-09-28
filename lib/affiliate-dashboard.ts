// Pure aggregation helpers for the affiliate dashboard. They take the raw
// Prisma groupBy rows so the math can be unit-tested without a database.

import type { AffiliateStatus, CommissionStatus, ReferralEvent } from "@prisma/client";

export type AffiliatePerformance = {
  clicks: number;
  uniqueClicks: number;
  leads: number;
  sales: number;
  /** Net commission across every non-reversed status. */
  earned: number;
  /** Pending + approved + scheduled: owed but not yet paid out. */
  unpaid: number;
  paid: number;
  /** Sales per unique click, as a percentage. */
  conversionRate: number;
};

export type CommissionSummary = {
  total: number;
  pending: number;
  approved: number;
  scheduled: number;
  paid: number;
  reversed: number;
};

const EMPTY: AffiliatePerformance = {
  clicks: 0,
  uniqueClicks: 0,
  leads: 0,
  sales: 0,
  earned: 0,
  unpaid: 0,
  paid: 0,
  conversionRate: 0,
};

export function conversionRate(sales: number, clicks: number) {
  if (clicks <= 0) return 0;
  return Math.min(100, (sales / clicks) * 100);
}

export function buildAffiliatePerformance(input: {
  referrals: { affiliateId: string; event: ReferralEvent; _count: { _all: number } }[];
  uniqueVisitors: { affiliateId: string }[];
  commissions: { affiliateId: string; status: CommissionStatus; _sum: { amount: number | null } }[];
}): Map<string, AffiliatePerformance> {
  const byId = new Map<string, AffiliatePerformance>();
  const entry = (id: string) => {
    let current = byId.get(id);
    if (!current) {
      current = { ...EMPTY };
      byId.set(id, current);
    }
    return current;
  };

  for (const row of input.referrals) {
    const current = entry(row.affiliateId);
    if (row.event === "CLICK") current.clicks += row._count._all;
    if (row.event === "LEAD") current.leads += row._count._all;
    if (row.event === "SALE") current.sales += row._count._all;
  }
  const unique = new Map<string, number>();
  for (const visit of input.uniqueVisitors) {
    unique.set(visit.affiliateId, (unique.get(visit.affiliateId) ?? 0) + 1);
  }
  for (const row of input.commissions) {
    const current = entry(row.affiliateId);
    const amount = row._sum.amount ?? 0;
    if (row.status === "REVERSED") continue;
    current.earned += amount;
    if (row.status === "PAID") current.paid += amount;
    else current.unpaid += amount;
  }
  for (const [id, current] of byId) {
    // Older clicks predate visitor hashing; fall back to raw clicks for them.
    current.uniqueClicks = unique.get(id) ?? current.clicks;
    current.conversionRate = conversionRate(current.sales, current.uniqueClicks);
  }
  return byId;
}

export function performanceFor(map: Map<string, AffiliatePerformance>, affiliateId: string) {
  return map.get(affiliateId) ?? { ...EMPTY };
}

export function summarizeCommissions(
  rows: { status: CommissionStatus; _sum: { amount: number | null; adjustedAmount?: number | null } }[]
): CommissionSummary {
  const summary: CommissionSummary = { total: 0, pending: 0, approved: 0, scheduled: 0, paid: 0, reversed: 0 };
  for (const row of rows) {
    const amount = row._sum.amount ?? 0;
    summary.total += amount;
    if (row.status === "REVERSED") summary.reversed += row._sum.adjustedAmount ?? 0;
    else if (row.status === "PAYOUT_SCHEDULED") summary.scheduled += amount;
    else if (row.status === "PENDING") summary.pending += amount;
    else if (row.status === "APPROVED") summary.approved += amount;
    else if (row.status === "PAID") summary.paid += amount;
  }
  return summary;
}

export function countAffiliateStatuses(
  rows: { status: AffiliateStatus; _count: { _all: number } }[]
): Record<AffiliateStatus | "ALL", number> {
  const counts: Record<AffiliateStatus | "ALL", number> = {
    ALL: 0,
    PENDING: 0,
    ACTIVE: 0,
    SUSPENDED: 0,
    REJECTED: 0,
    ARCHIVED: 0,
  };
  for (const row of rows) {
    counts[row.status] += row._count._all;
    // "All" hides archived affiliates, matching the default list view.
    if (row.status !== "ARCHIVED") counts.ALL += row._count._all;
  }
  return counts;
}
