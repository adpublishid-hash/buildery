import "server-only";

import { Prisma, type OrderStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Aggregations the dashboards used to compute by loading every row into Node.
 *
 * Loading a row per page view to count page views per day works on a new
 * store and stops working as soon as it has traffic — the query grows with
 * visits, not with the size of the answer. These push the counting into
 * Postgres, so the result is one row per day or per product regardless of how
 * many events sit behind it.
 *
 * Visitor counting lives in lib/analytics-metrics.ts, which counts first-party
 * visitor ids rather than user agents.
 *
 * Day buckets are computed in the Node process's own time zone, because that
 * is what `formatDayKey` in lib/analytics-range.ts uses. Bucketing in UTC here
 * would shift the chart by a day for any store not on UTC.
 */

/** The IANA zone `new Date().getDate()` resolves in, e.g. "Asia/Jakarta". */
export function serverTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function localDaySql(column: Prisma.Sql, timeZone: string) {
  // createdAt is stored as a UTC timestamp without zone; first mark it as UTC,
  // then render it in the server's zone.
  return Prisma.sql`to_char((${column} AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`;
}

type Range = { workspaceId: string; from: Date; to: Date };

/** Page views per local day, keyed like formatDayKey ("2026-09-13"). */
export async function countPageViewsByDay(
  range: Range,
  timeZone = serverTimeZone()
): Promise<Map<string, number>> {
  const day = localDaySql(Prisma.sql`"createdAt"`, timeZone);
  const rows = await prisma.$queryRaw<Array<{ day: string; count: bigint }>>`
    SELECT ${day} AS day, COUNT(*)::bigint AS count
    FROM "AnalyticsEvent"
    WHERE "workspaceId" = ${range.workspaceId}
      AND "type" = 'PAGE_VIEW'::"AnalyticsEventType"
      AND ("createdAt" AT TIME ZONE 'UTC') >= ${range.from} AND ("createdAt" AT TIME ZONE 'UTC') <= ${range.to}
    GROUP BY 1
  `;
  return new Map(rows.map((row) => [row.day, Number(row.count)]));
}

/** Orders created per local day. */
export async function countOrdersByDay(
  range: Range,
  timeZone = serverTimeZone()
): Promise<Map<string, number>> {
  const day = localDaySql(Prisma.sql`"createdAt"`, timeZone);
  const rows = await prisma.$queryRaw<Array<{ day: string; count: bigint }>>`
    SELECT ${day} AS day, COUNT(*)::bigint AS count
    FROM "Order"
    WHERE "workspaceId" = ${range.workspaceId}
      AND ("createdAt" AT TIME ZONE 'UTC') >= ${range.from} AND ("createdAt" AT TIME ZONE 'UTC') <= ${range.to}
    GROUP BY 1
  `;
  return new Map(rows.map((row) => [row.day, Number(row.count)]));
}

/**
 * Distinct user agents among page views. The dashboard previously grouped by
 * user agent — one row per distinct browser string — only to count them.
 */
export type TopProduct = { name: string; quantity: number; revenue: number };

/**
 * Best sellers in a range, net of refunds, grouped the same way the page did:
 * by productId, falling back to the item name for deleted products.
 */
export async function topProductsInRange(
  range: Range & { statuses: readonly OrderStatus[]; limit?: number }
): Promise<TopProduct[]> {
  const statuses = Prisma.join(
    range.statuses.map((status) => Prisma.sql`${status}::"OrderStatus"`)
  );
  const rows = await prisma.$queryRaw<
    Array<{ name: string; quantity: bigint; revenue: bigint }>
  >`
    WITH sold AS (
      SELECT COALESCE(oi."productId", oi."nameSnapshot") AS key,
             oi."nameSnapshot" AS name,
             oi."quantity" AS quantity,
             oi."unitPrice" * oi."quantity" AS revenue,
             o."createdAt" AS at
      FROM "OrderItem" oi
      JOIN "Order" o ON o."id" = oi."orderId"
      WHERE o."workspaceId" = ${range.workspaceId}
        AND (o."createdAt" AT TIME ZONE 'UTC') >= ${range.from} AND (o."createdAt" AT TIME ZONE 'UTC') <= ${range.to}
        AND o."status" IN (${statuses})
    ),
    returned AS (
      SELECT COALESCE(oi."productId", oi."nameSnapshot") AS key,
             oi."nameSnapshot" AS name,
             -ri."quantity" AS quantity,
             -(oi."unitPrice" * ri."quantity") AS revenue,
             NULL::timestamp AS at
      FROM "OrderRefundItem" ri
      JOIN "OrderRefund" r ON r."id" = ri."refundId"
      JOIN "OrderItem" oi ON oi."id" = ri."orderItemId"
      WHERE r."workspaceId" = ${range.workspaceId}
        AND r."status" = 'REFUNDED'::"RefundStatus"
        AND (
          ((r."refundedAt" AT TIME ZONE 'UTC') >= ${range.from} AND (r."refundedAt" AT TIME ZONE 'UTC') <= ${range.to})
          OR (r."refundedAt" IS NULL AND (r."createdAt" AT TIME ZONE 'UTC') >= ${range.from} AND (r."createdAt" AT TIME ZONE 'UTC') <= ${range.to})
        )
    ),
    combined AS (
      SELECT * FROM sold UNION ALL SELECT * FROM returned
    )
    SELECT
      -- The page labelled a product by the first item it saw; for a product
      -- that is the same name on every row, so any deterministic pick matches.
      (ARRAY_AGG(name ORDER BY at NULLS LAST))[1] AS name,
      GREATEST(SUM(quantity), 0)::bigint AS quantity,
      GREATEST(SUM(revenue), 0)::bigint AS revenue
    FROM combined
    GROUP BY key
    HAVING GREATEST(SUM(quantity), 0) > 0 OR GREATEST(SUM(revenue), 0) > 0
    ORDER BY quantity DESC
    LIMIT ${range.limit ?? 5}
  `;
  return rows.map((row) => ({
    name: row.name,
    quantity: Number(row.quantity),
    revenue: Number(row.revenue),
  }));
}

/** Cost of goods sold across every paid order of a workspace. */
export async function sumCostOfGoodsSold(input: {
  workspaceId: string;
  statuses: readonly OrderStatus[];
}): Promise<number> {
  const statuses = Prisma.join(
    input.statuses.map((status) => Prisma.sql`${status}::"OrderStatus"`)
  );
  const rows = await prisma.$queryRaw<Array<{ cogs: bigint | null }>>`
    SELECT SUM(COALESCE(p."costPrice", 0) * oi."quantity")::bigint AS cogs
    FROM "OrderItem" oi
    JOIN "Order" o ON o."id" = oi."orderId"
    LEFT JOIN "Product" p ON p."id" = oi."productId"
    WHERE o."workspaceId" = ${input.workspaceId}
      AND o."status" IN (${statuses})
  `;
  return Number(rows[0]?.cogs ?? 0);
}
