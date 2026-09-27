import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Funnel and revenue per traffic source / medium / campaign.
 *
 * Every funnel event carries the first-touch campaign the visitor arrived
 * with (lib/analytics-visitor.ts), so a purchase days later is still credited
 * to the ad that brought them. Computed in Postgres: one row per campaign,
 * however many events sit behind it.
 */

export type CampaignRow = {
  source: string;
  medium: string;
  campaign: string;
  visitors: number;
  views: number;
  addToCart: number;
  checkouts: number;
  purchases: number;
  revenue: number;
  refunded: number;
};

export const DIRECT_SOURCE = "(direct)";
const NONE = "(none)";
const NOT_SET = "(not set)";

export async function campaignReport(input: {
  workspaceId: string;
  from: Date;
  to: Date;
  limit?: number;
}): Promise<CampaignRow[]> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const rows = await prisma.$queryRaw<
    Array<{
      source: string;
      medium: string;
      campaign: string;
      visitors: bigint;
      views: bigint;
      add_to_cart: bigint;
      checkouts: bigint;
      purchases: bigint;
      revenue: bigint;
      refunded: bigint;
    }>
  >`
    SELECT
      COALESCE(NULLIF(e."utmSource", ''), ${DIRECT_SOURCE}) AS source,
      COALESCE(NULLIF(e."utmMedium", ''), ${NONE}) AS medium,
      COALESCE(NULLIF(e."utmCampaign", ''), ${NOT_SET}) AS campaign,
      COUNT(DISTINCT e."visitorId")::bigint AS visitors,
      COUNT(*) FILTER (WHERE e.type = 'VIEW_CONTENT')::bigint AS views,
      COUNT(*) FILTER (WHERE e.type = 'ADD_TO_CART')::bigint AS add_to_cart,
      COUNT(*) FILTER (WHERE e.type = 'BEGIN_CHECKOUT')::bigint AS checkouts,
      COUNT(DISTINCT e."orderId") FILTER (WHERE e.type = 'PURCHASE')::bigint AS purchases,
      COALESCE(SUM(e.value) FILTER (WHERE e.type = 'PURCHASE'), 0)::bigint AS revenue,
      COALESCE(SUM(o."refundedAmount") FILTER (WHERE e.type = 'PURCHASE'), 0)::bigint AS refunded
    FROM "AnalyticsEvent" e
    LEFT JOIN "Order" o ON o.id = e."orderId" AND e.type = 'PURCHASE'
    WHERE e."workspaceId" = ${input.workspaceId}
      AND (e."createdAt" AT TIME ZONE 'UTC') >= ${input.from}
      AND (e."createdAt" AT TIME ZONE 'UTC') <= ${input.to}
      AND e.type IN ('PAGE_VIEW', 'VIEW_CONTENT', 'ADD_TO_CART', 'BEGIN_CHECKOUT', 'PURCHASE')
    GROUP BY 1, 2, 3
    ORDER BY revenue DESC, purchases DESC, visitors DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    source: row.source,
    medium: row.medium,
    campaign: row.campaign,
    visitors: Number(row.visitors),
    views: Number(row.views),
    addToCart: Number(row.add_to_cart),
    checkouts: Number(row.checkouts),
    purchases: Number(row.purchases),
    revenue: Number(row.revenue),
    refunded: Number(row.refunded),
  }));
}

/** Paid ad traffic, by the mediums ad platforms and the click-id capture use. */
export function isPaidMedium(medium: string) {
  return /^(cpc|ppc|paid|paidsocial|paid_social|paid-social|cpm|display|ads?)$/i.test(medium);
}

export function summarizeCampaigns(rows: CampaignRow[]) {
  const total = rows.reduce(
    (sum, row) => ({
      visitors: sum.visitors + row.visitors,
      purchases: sum.purchases + row.purchases,
      revenue: sum.revenue + row.revenue,
      refunded: sum.refunded + row.refunded,
    }),
    { visitors: 0, purchases: 0, revenue: 0, refunded: 0 }
  );
  const paid = rows.filter((row) => isPaidMedium(row.medium));
  return {
    ...total,
    netRevenue: Math.max(total.revenue - total.refunded, 0),
    paidRevenue: paid.reduce((sum, row) => sum + row.revenue - row.refunded, 0),
    paidPurchases: paid.reduce((sum, row) => sum + row.purchases, 0),
  };
}
