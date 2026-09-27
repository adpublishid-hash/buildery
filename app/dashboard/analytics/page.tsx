import type { ReactNode } from "react";
import {
  ArrowUpRight,
  Download,
  Eye,
  Globe2,
  GraduationCap,
  Handshake,
  Package,
  ShoppingBag,
  Smartphone,
  Users,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";
import {
  dayLabel,
  eachDayKey,
  RANGE_LABEL,
  resolveRange,
  type RangeKey,
} from "@/lib/analytics-range";
import { formatPrice } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { AnalyticsRangePicker } from "@/components/dashboard/analytics-range-picker";
import { countOrdersByDay, topProductsInRange } from "@/lib/analytics-aggregates";
import { cachedAnalytics, rangeKey } from "@/lib/analytics-cache";
import { analyticsDailySeries } from "@/lib/analytics-rollup";
import {
  changeTrend,
  countDistinctVisitors,
  deviceBreakdown,
  describeChange,
  formatRate,
  percentChange,
  previousRange,
  visitorConversionRate,
} from "@/lib/analytics-metrics";
import {
  AnalyticsLineChart,
  type AnalyticsPoint,
} from "@/components/dashboard/analytics-line-chart";

export const metadata = { title: "Analitik · My Landing" };
export const dynamic = "force-dynamic";

const REVENUE_STATUSES = ["PAID", "PROCESSING", "COMPLETED"] as const;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: { range?: string; from?: string; to?: string };
}) {
  const { workspace } = await requireCurrentWorkspace();
  const range = resolveRange(searchParams);
  const { from, to, key } = range;

  const [
    pageViews,
    uniqueVisitors,
    devices,
    orderCount,
    revenueAgg,
    refundedAgg,
    topProducts,
    enrollmentsAgg,
    affiliateAgg,
    dailySeries,
    ordersByDay,
    topPagesRaw,
    topReferrersRaw,
  ] = await Promise.all([
    prisma.analyticsEvent.count({
      where: {
        workspaceId: workspace.id,
        type: "PAGE_VIEW",
        createdAt: { gte: from, lte: to },
      },
    }),
    cachedAnalytics(["visitors", workspace.id, ...rangeKey(range)], () =>
      countDistinctVisitors({ workspaceId: workspace.id, from, to })
    ),
    cachedAnalytics(["devices", workspace.id, ...rangeKey(range)], () =>
      deviceBreakdown({ workspaceId: workspace.id, from, to })
    ),
    prisma.order.count({
      where: { workspaceId: workspace.id, createdAt: { gte: from, lte: to } },
    }),
    prisma.order.aggregate({
      where: {
        workspaceId: workspace.id,
        createdAt: { gte: from, lte: to },
        status: { in: [...REVENUE_STATUSES] },
      },
      _sum: { total: true },
    }),
    prisma.orderRefund.aggregate({
      where: {
        workspaceId: workspace.id,
        status: "REFUNDED",
        OR: [
          { refundedAt: { gte: from, lte: to } },
          { refundedAt: null, createdAt: { gte: from, lte: to } },
        ],
      },
      _sum: { amount: true },
    }),
    topProductsInRange({
      workspaceId: workspace.id,
      from,
      to,
      statuses: REVENUE_STATUSES,
    }),
    prisma.enrollment.groupBy({
      by: ["courseId"],
      where: { workspaceId: workspace.id, createdAt: { gte: from, lte: to } },
      _count: { _all: true },
    }),
    prisma.commission.groupBy({
      by: ["affiliateId"],
      where: {
        workspaceId: workspace.id,
        createdAt: { gte: from, lte: to },
        status: { not: "REVERSED" },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    analyticsDailySeries({ workspaceId: workspace.id, from, to }),
    countOrdersByDay({ workspaceId: workspace.id, from, to }),
    prisma.analyticsEvent.groupBy({
      by: ["path"],
      where: {
        workspaceId: workspace.id,
        type: "PAGE_VIEW",
        createdAt: { gte: from, lte: to },
      },
      _count: { _all: true },
      orderBy: { _count: { path: "desc" } },
      take: 5,
    }),
    prisma.analyticsEvent.groupBy({
      by: ["referrer"],
      where: {
        workspaceId: workspace.id,
        type: "PAGE_VIEW",
        createdAt: { gte: from, lte: to },
        referrer: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { referrer: "desc" } },
      take: 5,
    }),
  ]);

  // The same window, immediately before this one, for "vs periode sebelumnya".
  const before = previousRange(range);
  const [prevVisitors, prevOrders, prevRevenueAgg, prevPageViews] = await Promise.all([
    cachedAnalytics(["visitors", workspace.id, ...rangeKey(before)], () =>
      countDistinctVisitors({ workspaceId: workspace.id, ...before })
    ),
    prisma.order.count({
      where: { workspaceId: workspace.id, createdAt: { gte: before.from, lte: before.to } },
    }),
    prisma.order.aggregate({
      where: {
        workspaceId: workspace.id,
        createdAt: { gte: before.from, lte: before.to },
        status: { in: [...REVENUE_STATUSES] },
      },
      _sum: { total: true },
    }),
    prisma.analyticsEvent.count({
      where: {
        workspaceId: workspace.id,
        type: "PAGE_VIEW",
        createdAt: { gte: before.from, lte: before.to },
      },
    }),
  ]);

  const grossRevenue = revenueAgg._sum.total ?? 0;
  const refundedRevenue = refundedAgg._sum.amount ?? 0;
  const revenue = Math.max(0, grossRevenue - refundedRevenue);
  const conversion = visitorConversionRate(orderCount, uniqueVisitors);
  const viewsChange = percentChange(pageViews, prevPageViews);
  const visitorsChange = percentChange(uniqueVisitors, prevVisitors);
  const ordersChange = percentChange(orderCount, prevOrders);
  const revenueChange = percentChange(revenue, prevRevenueAgg._sum.total ?? 0);

  // topProducts arrives already grouped, netted against refunds, and ranked
  // (lib/analytics-aggregates.ts).

  const courseIds = enrollmentsAgg.map((c) => c.courseId);
  const courseLookup = await prisma.course.findMany({
    where: { id: { in: courseIds } },
    select: { id: true, title: true },
  });
  const courseById = new Map(courseLookup.map((c) => [c.id, c]));
  const topCourses = enrollmentsAgg
    .map((c) => ({
      id: c.courseId,
      title: courseById.get(c.courseId)?.title ?? "Kursus dihapus",
      enrollments: c._count._all,
    }))
    .sort((a, b) => b.enrollments - a.enrollments)
    .slice(0, 5);

  const affiliateIds = affiliateAgg.map((a) => a.affiliateId);
  const affiliateLookup = await prisma.affiliate.findMany({
    where: { id: { in: affiliateIds } },
    include: { customer: { select: { name: true, email: true } } },
  });
  const affById = new Map(affiliateLookup.map((a) => [a.id, a]));
  const topAffiliates = affiliateAgg
    .map((a) => ({
      id: a.affiliateId,
      name: affById.get(a.affiliateId)?.customer.name ?? "Afiliasi dihapus",
      code: affById.get(a.affiliateId)?.referralCode ?? "-",
      sales: a._count._all,
      earned: a._sum.amount ?? 0,
    }))
    .sort((a, b) => b.earned - a.earned)
    .slice(0, 5);

  const days = eachDayKey(from, to);
  const chartData: AnalyticsPoint[] = days.map((dayKeyValue) => ({
    label: dayLabel(dayKeyValue),
    // Page views come from the daily rollup, so the chart still works for
    // ranges older than the raw-event retention window.
    views: dailySeries.get(dayKeyValue)?.pageViews ?? 0,
    orders: ordersByDay.get(dayKeyValue) ?? 0,
  }));

  // Device first, browser as the detail line under it.
  const deviceTotals = new Map<string, number>();
  for (const row of devices) {
    deviceTotals.set(row.device, (deviceTotals.get(row.device) ?? 0) + row.visitors);
  }
  const deviceVisitorTotal = Array.from(deviceTotals.values()).reduce((a, b) => a + b, 0);
  const deviceSummary = [
    ...Array.from(deviceTotals.entries()).map(([label, visitors]) => ({
      label,
      visitors,
      share: deviceVisitorTotal > 0 ? (visitors / deviceVisitorTotal) * 100 : 0,
    })),
    ...devices.slice(0, 4).map((row) => ({
      label: `${row.device} · ${row.browser}`,
      visitors: row.visitors,
      share: deviceVisitorTotal > 0 ? (row.visitors / deviceVisitorTotal) * 100 : 0,
    })),
  ].sort((a, b) => b.visitors - a.visitors);

  const topPages = topPagesRaw.map((row) => ({
    path: row.path ?? "/",
    views: row._count._all,
  }));
  const topReferrers = topReferrersRaw.map((row) => ({
    source: row.referrer ?? "Direct",
    views: row._count._all,
  }));

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Analitik"
        description={`Pantau traffic, order, revenue, dan konten terbaik untuk ${RANGE_LABEL[
          key
        ].toLowerCase()}.`}
        action={
          <>
            <AnalyticsRangePicker
              current={key as RangeKey}
              from={searchParams.from}
              to={searchParams.to}
            />
            <Button asChild variant="outline" size="sm">
              <a
                href={`/dashboard/analytics/export?${new URLSearchParams({
                  range: key,
                  ...(searchParams.from ? { from: searchParams.from } : {}),
                  ...(searchParams.to ? { to: searchParams.to } : {}),
                }).toString()}`}
              >
                <Download /> CSV
              </a>
            </Button>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Tampilan halaman"
          value={pageViews.toLocaleString("id-ID")}
          delta={describeChange(viewsChange, "Semua halaman publik")}
          trend={changeTrend(viewsChange)}
          icon={Eye}
        />
        <StatCard
          label="Pengunjung"
          value={uniqueVisitors.toLocaleString("id-ID")}
          delta={describeChange(visitorsChange, "Orang unik, bukan kunjungan")}
          trend={changeTrend(visitorsChange)}
          icon={Users}
        />
        <StatCard
          label="Order"
          value={orderCount.toLocaleString("id-ID")}
          delta={describeChange(
            ordersChange,
            `${formatRate(conversion)} konversi pengunjung`
          )}
          trend={changeTrend(ordersChange)}
          icon={ShoppingBag}
        />
        <StatCard
          label="Net revenue"
          value={formatPrice(revenue)}
          delta={describeChange(
            revenueChange,
            `Gross ${formatPrice(grossRevenue)} · refund ${formatPrice(refundedRevenue)}`
          )}
          trend={changeTrend(revenueChange)}
          icon={ArrowUpRight}
        />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Traffic & order</CardTitle>
            <CardDescription>
              Pergerakan tampilan halaman dan order per hari.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AnalyticsLineChart data={chartData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe2 className="h-4 w-4 text-zinc-400" />
              Sumber traffic
            </CardTitle>
            <CardDescription>Referrer teratas pada rentang ini.</CardDescription>
          </CardHeader>
          <CardContent>
            <RankList
              empty="Belum ada data referrer."
              items={topReferrers.map((item) => ({
                key: item.source,
                label: item.source,
                value: `${item.views.toLocaleString("id-ID")} view`,
              }))}
            />
          </CardContent>
        </Card>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="h-4 w-4 text-zinc-400" />
              Perangkat pengunjung
            </CardTitle>
            <CardDescription>
              Dihitung dari pengunjung unik. Konversi yang jauh lebih rendah di
              mobile biasanya berarti checkout perlu diperbaiki di layar kecil.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RankList
              empty="Belum ada data perangkat."
              items={deviceSummary.map((item) => ({
                key: item.label,
                label: item.label,
                value: `${item.visitors.toLocaleString("id-ID")} orang · ${formatRate(
                  item.share
                )}`,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Eye className="h-4 w-4 text-zinc-400" />
              Halaman populer
            </CardTitle>
            <CardDescription>URL dengan traffic tertinggi.</CardDescription>
          </CardHeader>
          <CardContent>
            <RankList
              empty="Belum ada halaman yang dikunjungi."
              items={topPages.map((item) => ({
                key: item.path,
                label: item.path,
                value: `${item.views.toLocaleString("id-ID")} view`,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4 text-zinc-400" />
              Produk terlaris
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RankList
              empty="Belum ada penjualan produk."
              items={topProducts.map((item) => ({
                key: item.name,
                label: item.name,
                value: `${item.quantity} terjual · ${formatPrice(
                  item.revenue
                )}`,
              }))}
            />
          </CardContent>
        </Card>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="h-4 w-4 text-zinc-400" />
              Kursus terbaik
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RankList
              empty="Belum ada enrollment kursus."
              items={topCourses.map((item) => ({
                key: item.id,
                label: item.title,
                value: `${item.enrollments} peserta`,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Handshake className="h-4 w-4 text-zinc-400" />
              Performa afiliasi
            </CardTitle>
            <CardDescription>Komisi dan sales dari referral.</CardDescription>
          </CardHeader>
          <CardContent>
            {topAffiliates.length === 0 ? (
              <EmptyRow>Belum ada komisi pada rentang ini.</EmptyRow>
            ) : (
              <ul className="space-y-2 text-sm">
                {topAffiliates.map((affiliate) => (
                  <li
                    key={affiliate.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Badge variant="secondary" className="font-mono">
                        {affiliate.code}
                      </Badge>
                      <span className="truncate text-zinc-900 dark:text-zinc-50">
                        {affiliate.name}
                      </span>
                    </span>
                    <span className="shrink-0 text-zinc-500">
                      {affiliate.sales} sale · {formatPrice(affiliate.earned)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function RankList({
  items,
  empty,
}: {
  items: { key: string; label: string; value: string }[];
  empty: string;
}) {
  if (items.length === 0) return <EmptyRow>{empty}</EmptyRow>;

  return (
    <ul className="space-y-2 text-sm">
      {items.map((item, index) => (
        <li key={item.key} className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              {index + 1}
            </span>
            <span className="truncate text-zinc-900 dark:text-zinc-50">
              {item.label}
            </span>
          </span>
          <span className="shrink-0 text-xs text-zinc-500">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-center text-xs text-zinc-400 dark:border-zinc-800">
      {children}
    </p>
  );
}
