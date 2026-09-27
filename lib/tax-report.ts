import "server-only";

import { Prisma, type OrderStatus } from "@prisma/client";

import { serverTimeZone } from "@/lib/analytics-aggregates";
import { prisma } from "@/lib/prisma";

/**
 * Orders whose money settled at some point. Refunded orders stay in: their tax
 * was collected and then given back, and the refund column shows that. Leaving
 * them out would make a partial refund silently erase the whole order's tax.
 */
export const TAX_COLLECTED_STATUSES: OrderStatus[] = [
  "PAID",
  "PROCESSING",
  "COMPLETED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
];

export type TaxReportMonth = {
  /** "YYYY-MM" in the server's time zone. */
  key: string;
  orders: number;
  /** Tax base (DPP): discounted subtotal, excluding the tax itself when prices include it. */
  taxable: number;
  tax: number;
  /** Tax returned through refunds, in proportion to the refunded share of the order. */
  refunded: number;
};

/**
 * Tax collected per month, computed in Postgres so the report costs one row
 * per month however many orders sit behind it.
 *
 * Whether an order's prices included tax is not stored on the order, but it
 * is recoverable from its totals: checkout adds the tax on top only for
 * tax-exclusive prices (see createOrder in lib/actions/order.ts), so an order
 * whose total equals discounted subtotal + shipping had tax inside the price.
 */
export async function taxReportByMonth(input: {
  workspaceId: string;
  since: Date;
  timeZone?: string;
}): Promise<TaxReportMonth[]> {
  const tz = input.timeZone ?? serverTimeZone();
  const base = Prisma.sql`GREATEST("subtotal" - "discount", 0)`;
  const rows = await prisma.$queryRaw<
    Array<{ key: string; orders: bigint; taxable: bigint; tax: bigint; refunded: bigint }>
  >`
    SELECT
      to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM') AS key,
      COUNT(*)::bigint AS orders,
      COALESCE(SUM(
        CASE
          WHEN "taxAmount" > 0 AND "total" = ${base} + "shippingCost"
            THEN GREATEST(${base} - "taxAmount", 0)
          ELSE ${base}
        END
      ), 0)::bigint AS taxable,
      COALESCE(SUM("taxAmount"), 0)::bigint AS tax,
      COALESCE(SUM(
        CASE
          WHEN "total" > 0 AND "refundedAmount" > 0
            THEN ROUND(("taxAmount"::numeric * LEAST("refundedAmount", "total")) / "total")
          ELSE 0
        END
      ), 0)::bigint AS refunded
    FROM "Order"
    WHERE "workspaceId" = ${input.workspaceId}
      AND "status"::text IN (${Prisma.join(TAX_COLLECTED_STATUSES)})
      AND ("createdAt" AT TIME ZONE 'UTC') >= ${input.since}
    GROUP BY 1
    ORDER BY 1 DESC
  `;
  return rows.map((row) => ({
    key: row.key,
    orders: Number(row.orders),
    taxable: Number(row.taxable),
    tax: Number(row.tax),
    refunded: Number(row.refunded),
  }));
}

export function formatTaxRate(rateBps: number): string {
  const percent = rateBps / 100;
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(2);
}
