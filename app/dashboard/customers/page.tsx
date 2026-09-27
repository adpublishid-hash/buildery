import Link from "next/link";
import { CreditCard, Repeat2, ShoppingBag, Users, Wallet } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { formatPrice } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { CustomersTable } from "@/components/customers/customers-table";
import { AnalyticsRangePicker } from "@/components/dashboard/analytics-range-picker";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { RANGE_LABEL, resolveRange, type RangeKey } from "@/lib/analytics-range";
import {
  changeTrend,
  describeChange,
  formatRate,
  percentChange,
  previousRange,
} from "@/lib/analytics-metrics";
import {
  customerLifetimeStats,
  customerRangeStats,
  topCustomersByValue,
} from "@/lib/customer-metrics";
import { cachedAnalytics, rangeKey } from "@/lib/analytics-cache";

export const metadata = { title: "Pelanggan · My Landing" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: { range?: string; from?: string; to?: string; page?: string };
}) {
  const { workspace } = await requireCurrentWorkspace();
  const range = resolveRange(searchParams);
  const before = previousRange(range);
  const page = parsePage(searchParams.page);

  // Lifetime value and repeat rate come from SQL over every customer; they
  // used to be derived from the 50 rows this table happens to show.
  const [total, customers, plans, lifetime, inRange, prevRange, topCustomers] =
    await Promise.all([
    prisma.customer.count({ where: { workspaceId: workspace.id } }),
    prisma.customer.findMany({
      where: { workspaceId: workspace.id },
      include: {
        orders: {
          where: { status: { in: ["PAID", "PROCESSING", "COMPLETED"] } },
          select: { total: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            orders: { where: { status: { in: ["PAID", "PROCESSING", "COMPLETED"] } } },
            enrollments: true,
            memberships: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.membershipPlan.findMany({
      where: { workspaceId: workspace.id },
      include: {
        product: { select: { name: true } },
        _count: { select: { memberships: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    cachedAnalytics(["customer-lifetime", workspace.id], () =>
      customerLifetimeStats(workspace.id)
    ),
    cachedAnalytics(["customer-range", workspace.id, ...rangeKey(range)], () =>
      customerRangeStats({ workspaceId: workspace.id, from: range.from, to: range.to })
    ),
    cachedAnalytics(["customer-range", workspace.id, ...rangeKey(before)], () =>
      customerRangeStats({ workspaceId: workspace.id, ...before })
    ),
    cachedAnalytics(["top-customers", workspace.id], () =>
      topCustomersByValue({ workspaceId: workspace.id, limit: 5 })
    ),
  ]);

  const newCustomersChange = percentChange(inRange.newCustomers, prevRange.newCustomers);
  const revenueChange = percentChange(inRange.revenue, prevRange.revenue);

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Pelanggan"
        description={`Profil pelanggan, nilai seumur hidup, dan aktivitas untuk ${RANGE_LABEL[
          range.key
        ].toLowerCase()}.`}
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
          label="Pelanggan"
          value={total.toLocaleString("id-ID")}
          delta={describeChange(
            newCustomersChange,
            `${inRange.newCustomers.toLocaleString("id-ID")} baru di periode ini`
          )}
          trend={changeTrend(newCustomersChange)}
          icon={Users}
        />
        <StatCard
          label="Nilai seumur hidup"
          value={formatPrice(lifetime.lifetimeValue)}
          delta={`Rata-rata per pembeli · AOV ${formatPrice(lifetime.averageOrderValue)}`}
          icon={Wallet}
          trend="neutral"
        />
        <StatCard
          label="Pembeli berulang"
          value={formatRate(lifetime.repeatRate)}
          delta={`${lifetime.repeatBuyers.toLocaleString("id-ID")} dari ${lifetime.buyers.toLocaleString(
            "id-ID"
          )} pembeli`}
          icon={Repeat2}
          trend="neutral"
        />
        <StatCard
          label="Pendapatan periode ini"
          value={formatPrice(inRange.revenue)}
          delta={describeChange(
            revenueChange,
            `${inRange.newBuyers} pembeli baru · ${inRange.returningBuyers} lama`
          )}
          icon={ShoppingBag}
          trend={changeTrend(revenueChange)}
        />
      </section>

      {topCustomers.length > 0 ? (
        <Card className="mt-6">
          <CardContent className="p-5">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Pelanggan paling bernilai
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Total belanja sepanjang waktu, sudah dikurangi refund.
            </p>
            <div className="mt-4 space-y-2">
              {topCustomers.map((customer, index) => (
                <div
                  key={customer.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-xs font-semibold text-zinc-400">#{index + 1}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {customer.name}
                      </p>
                      <p className="truncate text-xs text-zinc-500">{customer.email}</p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                      {formatPrice(customer.revenue)}
                    </p>
                    <p className="text-[11px] text-zinc-500">{customer.orders} order</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-6 min-w-0 max-w-full overflow-hidden">
        <CardContent className="p-0">
          {customers.length === 0 ? (
            <div className="p-6">
              <CustomersTable customers={[]} />
              <EmptyState
                icon={Users}
                title="Belum ada pelanggan"
                description="Pelanggan dibuat otomatis saat seseorang checkout, mendaftar kursus, atau bergabung ke membership."
              />
            </div>
          ) : (
            <>
              <CustomersTable customers={customers} />
              <Pagination
                page={page}
                total={total}
                pageSize={PAGE_SIZE}
                basePath="/dashboard/customers"
                params={{
                  range: searchParams.range,
                  from: searchParams.from,
                  to: searchParams.to,
                }}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardContent className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-zinc-500" />
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  Tier membership
                </h2>
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                Tier bisa dihubungkan ke produk. Setelah produk dibeli, membership customer aktif otomatis.
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/membership/members">Members</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/dashboard/membership/plans">Kelola tier</Link>
              </Button>
            </div>
          </div>
          {plans.length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {plans.slice(0, 3).map((plan) => (
                <div
                  key={plan.id}
                  className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                >
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {plan.name}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {plan.product ? `Terhubung: ${plan.product.name}` : "Tier gratis tanpa produk"}
                  </p>
                  <p className="mt-2 text-xs text-zinc-500">
                    {plan._count.memberships.toLocaleString("id-ID")} member
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
