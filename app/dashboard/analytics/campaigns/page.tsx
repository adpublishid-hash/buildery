import { Download, Megaphone, ShoppingBag, TrendingUp, Users } from "lucide-react";

import { resolveRange, RANGE_LABEL, type RangeKey } from "@/lib/analytics-range";
import {
  campaignReport,
  DIRECT_SOURCE,
  isPaidMedium,
  summarizeCampaigns,
} from "@/lib/campaign-report";
import {
  changeTrend,
  describeChange,
  percentChange,
  previousRange,
} from "@/lib/analytics-metrics";
import { cachedAnalytics, rangeKey } from "@/lib/analytics-cache";
import { formatPrice } from "@/lib/utils";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { AnalyticsRangePicker } from "@/components/dashboard/analytics-range-picker";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "Kampanye iklan · My Landing" };
export const dynamic = "force-dynamic";

export default async function CampaignReportPage({
  searchParams,
}: {
  searchParams: { range?: string; from?: string; to?: string };
}) {
  const { workspace } = await requireCurrentWorkspace();
  const range = resolveRange(searchParams);
  const before = previousRange(range);
  const [rows, previousRows] = await Promise.all([
    cachedAnalytics(["campaigns", workspace.id, ...rangeKey(range)], () =>
      campaignReport({ workspaceId: workspace.id, from: range.from, to: range.to })
    ),
    cachedAnalytics(["campaigns", workspace.id, ...rangeKey(before)], () =>
      campaignReport({ workspaceId: workspace.id, ...before })
    ),
  ]);
  const summary = summarizeCampaigns(rows);
  const previousSummary = summarizeCampaigns(previousRows);
  const visitorsChange = percentChange(summary.visitors, previousSummary.visitors);
  const purchasesChange = percentChange(summary.purchases, previousSummary.purchases);
  const revenueChange = percentChange(summary.netRevenue, previousSummary.netRevenue);
  const paidChange = percentChange(summary.paidRevenue, previousSummary.paidRevenue);
  const rate = (part: number, whole: number) =>
    whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—";

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Kampanye iklan"
        description={`Kunjungan, funnel, dan pendapatan per sumber dan kampanye untuk ${RANGE_LABEL[
          range.key
        ].toLowerCase()}. Pembelian dikreditkan ke kampanye pertama yang membawa pengunjung.`}
        action={
          <>
            <AnalyticsRangePicker
              current={range.key as RangeKey}
              from={searchParams.from}
              to={searchParams.to}
            />
            <Button asChild variant="outline" size="sm">
              <a
                href={`/dashboard/analytics/campaigns/export?${new URLSearchParams({
                  range: range.key,
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
          label="Pengunjung terlacak"
          value={summary.visitors.toLocaleString("id-ID")}
          delta={describeChange(visitorsChange, "Visitor unik dengan cookie pertama")}
          trend={changeTrend(visitorsChange)}
          icon={Users}
        />
        <StatCard
          label="Pembelian"
          value={summary.purchases.toLocaleString("id-ID")}
          delta={describeChange(
            purchasesChange,
            `${rate(summary.purchases, summary.visitors)} dari pengunjung`
          )}
          trend={changeTrend(purchasesChange)}
          icon={ShoppingBag}
        />
        <StatCard
          label="Pendapatan bersih"
          value={formatPrice(summary.netRevenue)}
          delta={describeChange(
            revenueChange,
            `Gross ${formatPrice(summary.revenue)} · refund ${formatPrice(summary.refunded)}`
          )}
          trend={changeTrend(revenueChange)}
          icon={TrendingUp}
        />
        <StatCard
          label="Dari iklan berbayar"
          value={formatPrice(summary.paidRevenue)}
          delta={describeChange(
            paidChange,
            `${summary.paidPurchases.toLocaleString("id-ID")} pembelian · medium cpc/paid`
          )}
          trend={changeTrend(paidChange)}
          icon={Megaphone}
        />
      </section>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Per kampanye</CardTitle>
          <CardDescription>
            Sumber dibaca dari parameter UTM. Klik iklan yang hanya membawa
            fbclid, ttclid, atau gclid otomatis tercatat sebagai facebook,
            tiktok, atau google dengan medium cpc. Untuk ROAS, bagi pendapatan
            bersih dengan biaya iklan kampanye di platform masing-masing.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="px-6 pb-8 text-sm text-zinc-500">
              Belum ada kunjungan terlacak di periode ini. Tambahkan parameter UTM
              (utm_source, utm_medium, utm_campaign) ke link iklan agar kampanye
              terpisah di laporan ini.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Sumber / medium</TableHead>
                    <TableHead>Kampanye</TableHead>
                    <TableHead className="text-right">Pengunjung</TableHead>
                    <TableHead className="text-right">Lihat produk</TableHead>
                    <TableHead className="text-right">Keranjang</TableHead>
                    <TableHead className="text-right">Checkout</TableHead>
                    <TableHead className="text-right">Beli</TableHead>
                    <TableHead className="text-right">Konversi</TableHead>
                    <TableHead className="pr-6 text-right">Pendapatan bersih</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={`${row.source}|${row.medium}|${row.campaign}`}>
                      <TableCell className="pl-6">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-zinc-900">
                            {row.source === DIRECT_SOURCE ? "Langsung" : row.source}
                          </span>
                          {isPaidMedium(row.medium) ? (
                            <Badge variant="secondary">iklan</Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-zinc-500">{row.medium}</p>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-sm text-zinc-700">
                        {row.campaign}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.visitors.toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.views.toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.addToCart.toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.checkouts.toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.purchases.toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-zinc-500">
                        {rate(row.purchases, row.visitors)}
                      </TableCell>
                      <TableCell className="pr-6 text-right font-medium tabular-nums">
                        {formatPrice(Math.max(row.revenue - row.refunded, 0))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
