import { ArrowDownRight, BarChart3, ShoppingBag, Users, Wallet } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { RANGE_LABEL, resolveRange, type RangeKey } from "@/lib/analytics-range";
import {
  changeTrend,
  describeChange,
  formatRate,
  funnelVisitorCounts,
  paidOrderRate,
  percentChange,
  previousRange,
  visitorConversionRate,
} from "@/lib/analytics-metrics";
import { cachedAnalytics, rangeKey } from "@/lib/analytics-cache";
import { formatPrice } from "@/lib/utils";
import { AnalyticsRangePicker } from "@/components/dashboard/analytics-range-picker";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Funnel · My Landing" };
export const dynamic = "force-dynamic";

const PAID_STATUSES = ["PAID", "PROCESSING", "COMPLETED"] as const;

export default async function FunnelsPage({
  searchParams,
}: {
  searchParams: { range?: string; from?: string; to?: string };
}) {
  const { workspace } = await requireCurrentWorkspace();
  const range = resolveRange(searchParams);
  const before = previousRange(range);
  const inRange = { gte: range.from, lte: range.to };

  const [funnel, prevFunnel, orders, paidOrders, revenueAgg, prevOrders] = await Promise.all([
    cachedAnalytics(["funnel", workspace.id, ...rangeKey(range)], () =>
      funnelVisitorCounts({ workspaceId: workspace.id, from: range.from, to: range.to })
    ),
    cachedAnalytics(["funnel", workspace.id, ...rangeKey(before)], () =>
      funnelVisitorCounts({ workspaceId: workspace.id, ...before })
    ),
    prisma.order.count({ where: { workspaceId: workspace.id, createdAt: inRange } }),
    prisma.order.count({
      where: {
        workspaceId: workspace.id,
        createdAt: inRange,
        status: { in: [...PAID_STATUSES] },
      },
    }),
    prisma.order.aggregate({
      where: {
        workspaceId: workspace.id,
        createdAt: inRange,
        status: { in: [...PAID_STATUSES] },
      },
      _sum: { total: true },
    }),
    prisma.order.count({
      where: { workspaceId: workspace.id, createdAt: { gte: before.from, lte: before.to } },
    }),
  ]);

  // People, not events: each step is the number of distinct visitors who
  // reached it, so the drop-off between steps is a real share of people.
  const steps = [
    {
      label: "Pengunjung",
      value: funnel.visitors,
      description: "Membuka halaman mana pun di toko",
    },
    {
      label: "Lihat produk",
      value: funnel.viewContent,
      description: "Membuka halaman detail produk",
    },
    {
      label: "Tambah ke keranjang",
      value: funnel.addToCart,
      description: "Memasukkan produk ke keranjang",
    },
    {
      label: "Mulai checkout",
      value: funnel.checkout,
      description: "Membuka halaman checkout",
    },
    {
      label: "Membeli",
      value: funnel.purchase,
      description: "Order berhasil dibuat",
    },
  ];
  const top = steps[0].value;
  const conversion = visitorConversionRate(orders, funnel.visitors);
  const paidRate = paidOrderRate(paidOrders, orders);
  const visitorsChange = percentChange(funnel.visitors, prevFunnel.visitors);
  const ordersChange = percentChange(orders, prevOrders);

  // The biggest share of people lost between two consecutive steps.
  const drops = steps.slice(1).map((step, index) => ({
    from: steps[index],
    to: step,
    lost: Math.max(steps[index].value - step.value, 0),
    lostRate: steps[index].value > 0 ? (1 - step.value / steps[index].value) * 100 : 0,
  }));
  const worst = drops
    .filter((drop) => drop.from.value > 0)
    .sort((a, b) => b.lostRate - a.lostRate)[0];

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Funnel"
        description={`Perjalanan pengunjung toko untuk ${RANGE_LABEL[
          range.key
        ].toLowerCase()}: dari membuka halaman sampai membeli.`}
        action={
          <AnalyticsRangePicker
            current={range.key as RangeKey}
            from={searchParams.from}
            to={searchParams.to}
          />
        }
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Pengunjung"
          value={funnel.visitors.toLocaleString("id-ID")}
          delta={describeChange(visitorsChange, "Orang unik di semua halaman")}
          trend={changeTrend(visitorsChange)}
          icon={Users}
        />
        <StatCard
          label="Order"
          value={orders.toLocaleString("id-ID")}
          delta={describeChange(ordersChange, `${formatRate(conversion)} dari pengunjung`)}
          trend={changeTrend(ordersChange)}
          icon={ShoppingBag}
        />
        <StatCard
          label="Konversi pengunjung"
          value={formatRate(conversion)}
          delta="Order dibagi pengunjung"
          trend="neutral"
          icon={BarChart3}
        />
        <StatCard
          label="Order lunas"
          value={formatRate(paidRate)}
          delta={`${paidOrders} lunas · ${formatPrice(revenueAgg._sum.total ?? 0)}`}
          trend="neutral"
          icon={Wallet}
        />
      </section>

      {worst && worst.lost > 0 ? (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-zinc-300 bg-zinc-100 px-4 py-3">
          <ArrowDownRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-800" />
          <p className="text-xs leading-5 text-zinc-900">
            Kebocoran terbesar ada antara{" "}
            <span className="font-semibold">{worst.from.label}</span> dan{" "}
            <span className="font-semibold">{worst.to.label}</span>:{" "}
            {worst.lost.toLocaleString("id-ID")} orang ({formatRate(worst.lostRate)}) berhenti di
            sana. Perbaiki tahap itu dulu sebelum menambah traffic.
          </p>
        </div>
      ) : null}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Tahapan funnel</CardTitle>
          <CardDescription>
            Tiap angka adalah jumlah orang, bukan jumlah klik. Persentase di kanan
            dihitung terhadap jumlah pengunjung.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {funnel.visitors === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-500">
              Belum ada kunjungan tercatat di periode ini.
            </p>
          ) : (
            steps.map((step, index) => {
              const previous = index > 0 ? steps[index - 1] : null;
              const width = top > 0 ? Math.max(4, Math.round((step.value / top) * 100)) : 4;
              const stepDrop =
                previous && previous.value > 0
                  ? (1 - step.value / previous.value) * 100
                  : null;
              return (
                <div key={step.label} className="space-y-2">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {step.label}
                      </p>
                      <p className="text-xs text-zinc-500">{step.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                        {step.value.toLocaleString("id-ID")}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {top > 0 ? formatRate((step.value / top) * 100) : "0%"} dari pengunjung
                        {stepDrop !== null && stepDrop > 0
                          ? ` · −${formatRate(stepDrop)} dari tahap sebelumnya`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-zinc-900 dark:bg-zinc-100"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
