import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { countOrdersByDay } from "@/lib/analytics-aggregates";
import { analyticsDailySeries } from "@/lib/analytics-rollup";
import { eachDayKey, resolveRange } from "@/lib/analytics-range";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace";
import { csvCell } from "@/lib/csv";

/** Daily traffic, orders and revenue for the selected range, as CSV. */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const current = await getCurrentWorkspace(session.user.id);
  if (!current) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const params = request.nextUrl.searchParams;
  const range = resolveRange({
    range: params.get("range"),
    from: params.get("from"),
    to: params.get("to"),
  });
  const workspaceId = current.workspace.id;
  const metricRange = { workspaceId, from: range.from, to: range.to };

  const [series, orders, paidOrders] = await Promise.all([
    analyticsDailySeries(metricRange),
    countOrdersByDay(metricRange),
    prisma.order.findMany({
      where: {
        workspaceId,
        createdAt: { gte: range.from, lte: range.to },
        status: { in: ["PAID", "PROCESSING", "COMPLETED"] },
      },
      select: { createdAt: true, total: true, refundedAmount: true },
    }),
  ]);

  // Revenue per day, net of refunds recorded on the order.
  const revenueByDay = new Map<string, number>();
  for (const order of paidOrders) {
    const day = order.createdAt.toLocaleDateString("en-CA");
    const net = Math.max(order.total - order.refundedAmount, 0);
    revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + net);
  }

  const rows = [
    ["tanggal", "tampilan_halaman", "pengunjung", "order", "pendapatan_bersih"],
    ...eachDayKey(range.from, range.to).map((day) => [
      day,
      series.get(day)?.pageViews ?? 0,
      series.get(day)?.visitors ?? 0,
      orders.get(day) ?? 0,
      revenueByDay.get(day) ?? 0,
    ]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="analitik-${range.from
        .toISOString()
        .slice(0, 10)}-${range.to.toISOString().slice(0, 10)}.csv"`,
    },
  });
}
