import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * The definitions every dashboard shares.
 *
 * "Conversion" used to mean four different things on four pages — orders over
 * page views here, paid orders over all orders there, one of them mixing
 * all-time orders with a week of traffic. The numbers contradicted each other,
 * so the words are pinned down here and every page imports them:
 *
 * - Pengunjung (visitors): distinct first-party visitor ids in the range.
 * - Konversi: orders created ÷ visitors, in the same range.
 * - Order lunas: paid orders ÷ orders created, in the same range.
 *
 * Visitors fall back to the user agent for rows written before the visitor
 * cookie existed, so old ranges stay comparable instead of dropping to zero.
 */

export type MetricRange = { workspaceId: string; from: Date; to: Date };

const VISITOR_KEY = Prisma.sql`COALESCE("visitorId", 'ua:' || COALESCE("userAgent", 'unknown'))`;

export async function countDistinctVisitors(range: MetricRange): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT ${VISITOR_KEY})::bigint AS count
    FROM "AnalyticsEvent"
    WHERE "workspaceId" = ${range.workspaceId}
      AND "type" = 'PAGE_VIEW'::"AnalyticsEventType"
      AND ("createdAt" AT TIME ZONE 'UTC') >= ${range.from} AND ("createdAt" AT TIME ZONE 'UTC') <= ${range.to}
  `;
  return Number(rows[0]?.count ?? 0);
}

export type FunnelStepKey =
  | "visitors"
  | "viewContent"
  | "addToCart"
  | "checkout"
  | "purchase";

export type FunnelCounts = Record<FunnelStepKey, number>;

/**
 * People, not events: each step counts the distinct visitors who reached it,
 * so "50 add to cart" means fifty people, not one person clicking fifty times.
 */
export async function funnelVisitorCounts(range: MetricRange): Promise<FunnelCounts> {
  const rows = await prisma.$queryRaw<Array<{ type: string; visitors: bigint }>>`
    SELECT "type"::text AS type, COUNT(DISTINCT ${VISITOR_KEY})::bigint AS visitors
    FROM "AnalyticsEvent"
    WHERE "workspaceId" = ${range.workspaceId}
      AND ("createdAt" AT TIME ZONE 'UTC') >= ${range.from} AND ("createdAt" AT TIME ZONE 'UTC') <= ${range.to}
      AND "type" IN ('PAGE_VIEW', 'VIEW_CONTENT', 'ADD_TO_CART', 'BEGIN_CHECKOUT', 'PURCHASE')
    GROUP BY 1
  `;
  const byType = new Map(rows.map((row) => [row.type, Number(row.visitors)]));
  return {
    visitors: byType.get("PAGE_VIEW") ?? 0,
    viewContent: byType.get("VIEW_CONTENT") ?? 0,
    addToCart: byType.get("ADD_TO_CART") ?? 0,
    checkout: byType.get("BEGIN_CHECKOUT") ?? 0,
    purchase: byType.get("PURCHASE") ?? 0,
  };
}

/** Orders created ÷ visitors, as a percentage. */
export function visitorConversionRate(orders: number, visitors: number) {
  return visitors > 0 ? (orders / visitors) * 100 : 0;
}

/** Paid orders ÷ orders created, as a percentage. */
export function paidOrderRate(paidOrders: number, orders: number) {
  return orders > 0 ? (paidOrders / orders) * 100 : 0;
}

export function formatRate(rate: number) {
  if (!Number.isFinite(rate) || rate <= 0) return "0%";
  return `${rate < 10 ? rate.toFixed(2) : rate.toFixed(1)}%`;
}

/**
 * The equally long window ending where this one starts, for "vs periode
 * sebelumnya". A 7-day range compares with the 7 days before it.
 */
export function previousRange<T extends { from: Date; to: Date }>(range: T) {
  const span = range.to.getTime() - range.from.getTime();
  return {
    from: new Date(range.from.getTime() - span - 1),
    to: new Date(range.from.getTime() - 1),
  };
}

export type Change = { percent: number; direction: "up" | "down" | "flat" } | null;

/** Null when there is nothing to compare against, so the UI can stay quiet. */
export function percentChange(current: number, previous: number): Change {
  if (previous <= 0) return current > 0 ? { percent: 100, direction: "up" } : null;
  const percent = ((current - previous) / previous) * 100;
  if (Math.abs(percent) < 0.05) return { percent: 0, direction: "flat" };
  return { percent: Math.abs(percent), direction: percent > 0 ? "up" : "down" };
}

/** "+12,3% vs periode sebelumnya" — or a plain fallback when there is no base. */
export function describeChange(change: Change, fallback: string) {
  if (!change) return fallback;
  if (change.direction === "flat") return "Sama dengan periode sebelumnya";
  const sign = change.direction === "up" ? "+" : "−";
  const value = change.percent >= 100 ? Math.round(change.percent) : change.percent.toFixed(1);
  return `${sign}${value}% vs periode sebelumnya`;
}

export function changeTrend(change: Change): "up" | "down" | "neutral" {
  if (!change || change.direction === "flat") return "neutral";
  return change.direction;
}

export type DeviceRow = { device: string; browser: string; visitors: number };

/**
 * Devices and browsers, classified in SQL from the stored user agent.
 *
 * The user agent was recorded on every event and never shown anywhere, so the
 * phone-versus-desktop split — usually the first thing that explains a bad
 * checkout rate — was invisible.
 */
export async function deviceBreakdown(range: MetricRange): Promise<DeviceRow[]> {
  const rows = await prisma.$queryRaw<
    Array<{ device: string; browser: string; visitors: bigint }>
  >`
    SELECT
      CASE
        WHEN "userAgent" IS NULL THEN 'Tidak diketahui'
        WHEN "userAgent" ~* 'iPad|Tablet|Nexus 7|SM-T' THEN 'Tablet'
        WHEN "userAgent" ~* 'Mobi|Android|iPhone|iPod|Windows Phone' THEN 'Mobile'
        ELSE 'Desktop'
      END AS device,
      CASE
        WHEN "userAgent" IS NULL THEN 'Tidak diketahui'
        -- Order matters: most browsers also claim to be Chrome or Safari.
        WHEN "userAgent" ~* 'Edg/' THEN 'Edge'
        WHEN "userAgent" ~* 'OPR/|Opera' THEN 'Opera'
        WHEN "userAgent" ~* 'SamsungBrowser' THEN 'Samsung Internet'
        WHEN "userAgent" ~* 'FBAN|FBAV|Instagram' THEN 'In-app Meta'
        WHEN "userAgent" ~* 'Firefox/' THEN 'Firefox'
        WHEN "userAgent" ~* 'Chrome/|CriOS' THEN 'Chrome'
        WHEN "userAgent" ~* 'Safari/' THEN 'Safari'
        ELSE 'Lainnya'
      END AS browser,
      COUNT(DISTINCT ${VISITOR_KEY})::bigint AS visitors
    FROM "AnalyticsEvent"
    WHERE "workspaceId" = ${range.workspaceId}
      AND "type" = 'PAGE_VIEW'::"AnalyticsEventType"
      AND ("createdAt" AT TIME ZONE 'UTC') >= ${range.from} AND ("createdAt" AT TIME ZONE 'UTC') <= ${range.to}
    GROUP BY 1, 2
    ORDER BY visitors DESC
    LIMIT 20
  `;
  return rows.map((row) => ({
    device: row.device,
    browser: row.browser,
    visitors: Number(row.visitors),
  }));
}

/** Distinct visitors per day, in the server's time zone, for charts and exports. */
export async function countVisitorsByDay(
  range: MetricRange,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<Array<{ day: string; visitors: bigint }>>`
    SELECT
      to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day,
      COUNT(DISTINCT ${VISITOR_KEY})::bigint AS visitors
    FROM "AnalyticsEvent"
    WHERE "workspaceId" = ${range.workspaceId}
      AND "type" = 'PAGE_VIEW'::"AnalyticsEventType"
      AND ("createdAt" AT TIME ZONE 'UTC') >= ${range.from} AND ("createdAt" AT TIME ZONE 'UTC') <= ${range.to}
    GROUP BY 1
  `;
  return new Map(rows.map((row) => [row.day, Number(row.visitors)]));
}
