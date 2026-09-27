import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Customer value, computed in Postgres over every customer.
 *
 * The dashboard used to derive lifetime value and repeat rate from the 50
 * customers it happened to load for the table, so both numbers were wrong for
 * any store with more than 50 customers — and always understated.
 *
 * Revenue counts orders that were actually paid, net of refunds recorded
 * against them.
 */

const PAID_STATUSES = Prisma.sql`('PAID', 'PROCESSING', 'COMPLETED')`;

export type CustomerLifetimeStats = {
  customers: number;
  buyers: number;
  repeatBuyers: number;
  repeatRate: number;
  revenue: number;
  averageOrderValue: number;
  /** Revenue per buying customer. */
  lifetimeValue: number;
};

export async function customerLifetimeStats(workspaceId: string): Promise<CustomerLifetimeStats> {
  const rows = await prisma.$queryRaw<
    Array<{
      customers: bigint;
      buyers: bigint;
      repeat_buyers: bigint;
      orders: bigint;
      revenue: bigint;
    }>
  >`
    SELECT
      COUNT(*)::bigint AS customers,
      COUNT(*) FILTER (WHERE per_customer.orders > 0)::bigint AS buyers,
      COUNT(*) FILTER (WHERE per_customer.orders > 1)::bigint AS repeat_buyers,
      COALESCE(SUM(per_customer.orders), 0)::bigint AS orders,
      COALESCE(SUM(per_customer.revenue), 0)::bigint AS revenue
    FROM (
      SELECT
        c.id,
        COUNT(o.id) AS orders,
        COALESCE(SUM(GREATEST(o.total - o."refundedAmount", 0)), 0) AS revenue
      FROM "Customer" c
      LEFT JOIN "Order" o
        ON o."customerId" = c.id AND o.status::text IN ${PAID_STATUSES}
      WHERE c."workspaceId" = ${workspaceId}
      GROUP BY c.id
    ) per_customer
  `;
  const row = rows[0];
  const customers = Number(row?.customers ?? 0);
  const buyers = Number(row?.buyers ?? 0);
  const repeatBuyers = Number(row?.repeat_buyers ?? 0);
  const orders = Number(row?.orders ?? 0);
  const revenue = Number(row?.revenue ?? 0);
  return {
    customers,
    buyers,
    repeatBuyers,
    repeatRate: buyers > 0 ? (repeatBuyers / buyers) * 100 : 0,
    revenue,
    averageOrderValue: orders > 0 ? Math.round(revenue / orders) : 0,
    lifetimeValue: buyers > 0 ? Math.round(revenue / buyers) : 0,
  };
}

export type CustomerRangeStats = {
  newCustomers: number;
  buyers: number;
  newBuyers: number;
  returningBuyers: number;
  revenue: number;
};

/**
 * Buyers in a window, split by whether this was their first paid order ever.
 * New versus returning is the clearest signal of whether a store is growing or
 * living off the same customers.
 */
export async function customerRangeStats(input: {
  workspaceId: string;
  from: Date;
  to: Date;
}): Promise<CustomerRangeStats> {
  const [newCustomers, rows] = await Promise.all([
    prisma.customer.count({
      where: {
        workspaceId: input.workspaceId,
        createdAt: { gte: input.from, lte: input.to },
      },
    }),
    prisma.$queryRaw<
      Array<{ buyers: bigint; new_buyers: bigint; revenue: bigint }>
    >`
      SELECT
        COUNT(*)::bigint AS buyers,
        COUNT(*) FILTER (WHERE in_range.first_ever >= ${input.from})::bigint AS new_buyers,
        COALESCE(SUM(in_range.revenue), 0)::bigint AS revenue
      FROM (
        SELECT
          o."customerId",
          SUM(GREATEST(o.total - o."refundedAmount", 0)) AS revenue,
          (
            SELECT MIN(prev."createdAt")
            FROM "Order" prev
            WHERE prev."customerId" = o."customerId"
              AND prev.status::text IN ${PAID_STATUSES}
          ) AS first_ever
        FROM "Order" o
        WHERE o."workspaceId" = ${input.workspaceId}
          AND o."customerId" IS NOT NULL
          AND o.status::text IN ${PAID_STATUSES}
          AND (o."createdAt" AT TIME ZONE 'UTC') >= ${input.from}
          AND (o."createdAt" AT TIME ZONE 'UTC') <= ${input.to}
        GROUP BY o."customerId"
      ) in_range
    `,
  ]);
  const row = rows[0];
  const buyers = Number(row?.buyers ?? 0);
  const newBuyers = Number(row?.new_buyers ?? 0);
  return {
    newCustomers,
    buyers,
    newBuyers,
    returningBuyers: Math.max(buyers - newBuyers, 0),
    revenue: Number(row?.revenue ?? 0),
  };
}

export type TopCustomer = {
  id: string;
  name: string;
  email: string;
  orders: number;
  revenue: number;
};

export async function topCustomersByValue(input: {
  workspaceId: string;
  limit?: number;
}): Promise<TopCustomer[]> {
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 50);
  const rows = await prisma.$queryRaw<
    Array<{ id: string; name: string; email: string; orders: bigint; revenue: bigint }>
  >`
    SELECT c.id, c.name, c.email,
      COUNT(o.id)::bigint AS orders,
      COALESCE(SUM(GREATEST(o.total - o."refundedAmount", 0)), 0)::bigint AS revenue
    FROM "Customer" c
    JOIN "Order" o ON o."customerId" = c.id AND o.status::text IN ${PAID_STATUSES}
    WHERE c."workspaceId" = ${input.workspaceId}
    GROUP BY c.id, c.name, c.email
    ORDER BY revenue DESC, orders DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    orders: Number(row.orders),
    revenue: Number(row.revenue),
  }));
}
