import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Mail,
  Package,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Ticket,
  Users,
  Wallet,
  CircleDollarSign,
  Repeat2,
  ReceiptText,
} from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/store";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { sumCostOfGoodsSold } from "@/lib/analytics-aggregates";
import { RANGE_LABEL, resolveRange, type RangeKey } from "@/lib/analytics-range";
import {
  changeTrend,
  countDistinctVisitors,
  describeChange,
  formatRate,
  paidOrderRate,
  percentChange,
  previousRange,
  visitorConversionRate,
} from "@/lib/analytics-metrics";
import { customerLifetimeStats } from "@/lib/customer-metrics";
import { cachedAnalytics, rangeKey } from "@/lib/analytics-cache";
import { AnalyticsRangePicker } from "@/components/dashboard/analytics-range-picker";

export const metadata = { title: "eCommerce - My Landing" };

export default async function EcommercePage({
  searchParams,
}: {
  searchParams: { range?: string; from?: string; to?: string };
}) {
  const { workspace } = await requireCurrentWorkspace();
  const abandonedCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const range = resolveRange(searchParams);
  const before = previousRange(range);
  const inRange = { gte: range.from, lte: range.to };

  const [
    activeProducts,
    draftProducts,
    orders,
    pendingOrders,
    paidRevenue,
    refundedRevenue,
    customers,
    activeCoupons,
    openFollowUps,
    abandonedOrders,
    setting,
    integration,
    recentOrders,
    cogs,
    lifetime,
    visitors,
    prevVisitors,
    prevOrders,
    prevRevenue,
  ] = await Promise.all([
    prisma.product.count({ where: { workspaceId: workspace.id, status: "ACTIVE" } }),
    prisma.product.count({ where: { workspaceId: workspace.id, status: "DRAFT" } }),
    prisma.order.count({ where: { workspaceId: workspace.id, createdAt: inRange } }),
    prisma.order.count({ where: { workspaceId: workspace.id, status: "PENDING" } }),
    prisma.payment.aggregate({
      where: {
        workspaceId: workspace.id,
        status: "PAID",
        kind: "ORDER",
        paidAt: inRange,
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.orderRefund.aggregate({
      where: {
        workspaceId: workspace.id,
        status: "REFUNDED",
        OR: [
          { refundedAt: inRange },
          { refundedAt: null, createdAt: inRange },
        ],
      },
      _sum: { amount: true },
    }),
    prisma.customer.count({ where: { workspaceId: workspace.id } }),
    prisma.coupon.count({ where: { workspaceId: workspace.id, isActive: true } }),
    prisma.followUpTask.count({
      where: { workspaceId: workspace.id, status: { not: "DONE" } },
    }),
    prisma.order.count({
      where: {
        workspaceId: workspace.id,
        status: "PENDING",
        createdAt: { lte: abandonedCutoff },
      },
    }),
    prisma.ecommerceSetting.findUnique({ where: { workspaceId: workspace.id } }),
    prisma.integrationSetting.findUnique({ where: { workspaceId: workspace.id } }),
    prisma.order.findMany({
      where: { workspaceId: workspace.id },
      include: { customer: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    sumCostOfGoodsSold({
      workspaceId: workspace.id,
      statuses: ["PAID", "PROCESSING", "COMPLETED"],
    }),
    cachedAnalytics(["customer-lifetime", workspace.id], () =>
      customerLifetimeStats(workspace.id)
    ),
    cachedAnalytics(["visitors", workspace.id, ...rangeKey(range)], () =>
      countDistinctVisitors({ workspaceId: workspace.id, from: range.from, to: range.to })
    ),
    cachedAnalytics(["visitors", workspace.id, ...rangeKey(before)], () =>
      countDistinctVisitors({ workspaceId: workspace.id, ...before })
    ),
    prisma.order.count({
      where: { workspaceId: workspace.id, createdAt: { gte: before.from, lte: before.to } },
    }),
    prisma.payment.aggregate({
      where: {
        workspaceId: workspace.id,
        status: "PAID",
        kind: "ORDER",
        paidAt: { gte: before.from, lte: before.to },
      },
      _sum: { amount: true },
    }),
  ]);

  const paidOrders = paidRevenue._count._all;
  const netRevenue = Math.max(
    0,
    (paidRevenue._sum.amount ?? 0) - (refundedRevenue._sum.amount ?? 0)
  );
  // Same definitions as every other dashboard (lib/analytics-metrics.ts).
  const conversion = visitorConversionRate(orders, visitors);
  const paidRate = paidOrderRate(paidOrders, orders);
  const visitorsChange = percentChange(visitors, prevVisitors);
  const ordersChange = percentChange(orders, prevOrders);
  const revenueChange = percentChange(netRevenue, prevRevenue._sum.amount ?? 0);

  const grossProfit = netRevenue - cogs;
  const averageOrderValue = paidOrders > 0 ? Math.round(netRevenue / paidOrders) : 0;
  const repeatRate = lifetime.repeatRate;
  const setup = [
    {
      label: "Produk aktif",
      done: activeProducts > 0,
      href: "/dashboard/products",
      description: activeProducts > 0 ? `${activeProducts} produk siap jual` : "Buat produk pertama",
    },
    {
      label: "Checkout dikonfigurasi",
      done: Boolean(setting),
      href: "/dashboard/settings?tab=ecommerce",
      description: setting ? "Pengaturan toko tersimpan" : "Lengkapi pengaturan toko",
    },
    {
      label: "WhatsApp Inbox",
      done: Boolean(integration?.whatsappIsActive),
      href: "/dashboard/settings/integrations",
      description: integration?.whatsappIsActive
        ? `${integration.whatsappProvider} aktif`
        : "Aktifkan provider untuk balasan otomatis",
    },
    {
      label: "Kupon aktif",
      done: activeCoupons > 0,
      href: "/dashboard/coupons",
      description: activeCoupons > 0 ? `${activeCoupons} promo berjalan` : "Tambahkan promo bila dibutuhkan",
    },
  ];

  const workQueue = [
    {
      title: "Pending payment",
      value: pendingOrders,
      href: "/dashboard/orders?status=PENDING",
      icon: Wallet,
    },
    {
      title: "Follow-up terbuka",
      value: openFollowUps,
      href: "/dashboard/follow-up",
      icon: Mail,
    },
    {
      title: "Abandoned 24h+",
      value: abandonedOrders,
      href: "/dashboard/abandoned",
      icon: ShoppingCart,
    },
    {
      title: "Produk draft",
      value: draftProducts,
      href: "/dashboard/products",
      icon: Package,
    },
  ];

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="eCommerce"
        description={`Produk, checkout, pelanggan, dan promosi untuk ${RANGE_LABEL[
          range.key
        ].toLowerCase()}.`}
        action={
          <>
            <AnalyticsRangePicker
              current={range.key as RangeKey}
              from={searchParams.from}
              to={searchParams.to}
            />
          <Button asChild>
            <Link href="/dashboard/products/new">
              <Package className="h-4 w-4" />
              Produk Baru
            </Link>
          </Button>
          </>
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Produk Aktif" value={activeProducts} icon={Package} />
        <StatCard
          label="Order"
          value={orders.toLocaleString("id-ID")}
          delta={describeChange(ordersChange, "Di periode ini")}
          trend={changeTrend(ordersChange)}
          icon={ShoppingBag}
        />
        <StatCard
          label="Pengunjung"
          value={visitors.toLocaleString("id-ID")}
          delta={describeChange(visitorsChange, "Orang unik")}
          trend={changeTrend(visitorsChange)}
          icon={Users}
        />
        <StatCard
          label="Konversi pengunjung"
          value={formatRate(conversion)}
          delta={`${formatRate(paidRate)} order lunas`}
          icon={CheckCircle2}
          trend="neutral"
        />
        <StatCard
          label="Net Revenue"
          value={formatPrice(netRevenue)}
          delta={describeChange(revenueChange, "Sudah dikurangi refund")}
          icon={Wallet}
          trend={changeTrend(revenueChange)}
        />
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Average Order Value" value={formatPrice(averageOrderValue)} icon={ReceiptText} />
        <StatCard label="COGS / HPP" value={formatPrice(cogs)} icon={CircleDollarSign} />
        <StatCard label="Estimated Gross Profit" value={formatPrice(grossProfit)} icon={Wallet} trend={grossProfit >= 0 ? "up" : "down"} />
        <StatCard
          label="Pembeli berulang"
          value={formatRate(repeatRate)}
          delta={`${customers.toLocaleString("id-ID")} pelanggan · seluruh riwayat`}
          icon={Repeat2}
        />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Workflow eCommerce</CardTitle>
            <CardDescription>
              Jalur kerja dari produk sampai pesan WhatsApp dan follow-up.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <FlowCard icon={Package} label="Produk" href="/dashboard/products" />
            <FlowCard icon={ShoppingBag} label="Pesanan" href="/dashboard/orders" />
            <FlowCard icon={Users} label="Pelanggan" href="/dashboard/customers" />
            <FlowCard icon={Mail} label="Follow-up" href="/dashboard/follow-up" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Setup readiness</CardTitle>
            <CardDescription>Checklist integrasi toko yang paling sering dipakai.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {setup.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 p-3 transition hover:bg-zinc-50"
              >
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="mt-1 text-xs text-zinc-500">{item.description}</p>
                </div>
                <Badge variant={item.done ? "success" : "secondary"}>
                  {item.done ? "Ready" : "Todo"}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(360px,0.75fr)_minmax(0,1.25fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Antrian Kerja</CardTitle>
            <CardDescription>Masalah yang perlu ditangani lintas fitur.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {workQueue.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.title}
                  href={item.href}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 transition hover:bg-zinc-50"
                >
                  <span className="flex items-center gap-3">
                    <span className="rounded-lg bg-zinc-100 p-2 text-zinc-600">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-medium">{item.title}</span>
                      <span className="text-xs text-zinc-500">Klik untuk menindaklanjuti</span>
                    </span>
                  </span>
                  <span className="text-lg font-semibold">{item.value}</span>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Pesanan Terbaru</CardTitle>
              <CardDescription>Order terbaru yang menggerakkan funnel toko.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/orders">Lihat semua</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-200 p-8 text-center">
                <AlertTriangle className="mx-auto h-6 w-6 text-zinc-300" />
                <p className="mt-2 text-sm font-medium">Belum ada order</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Order akan muncul setelah checkout pertama.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {recentOrders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/dashboard/orders/${order.id}`}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{order.orderNumber}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {order.customer?.name ?? "Guest"} - {order.customer?.email ?? "no email"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">{order.status}</Badge>
                      <p className="text-sm font-semibold">{formatPrice(order.total)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <QuickLink href="/dashboard/coupons" icon={Ticket} label="Kelola Diskon" />
        <QuickLink href="/dashboard/funnels" icon={CheckCircle2} label="Lihat Funnel" />
        <QuickLink href="/dashboard/inbox" icon={Mail} label="Buka Inbox" />
        <QuickLink href="/dashboard/settings?tab=ecommerce" icon={Settings} label="Pengaturan" />
      </div>
    </div>
  );
}

function FlowCard({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Package;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-28 flex-col justify-between rounded-lg border border-zinc-200 p-4 transition hover:border-zinc-400 hover:bg-zinc-50"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex items-center justify-between text-sm font-medium">
        {label}
        <ArrowRight className="h-4 w-4 text-zinc-400 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Package;
  label: string;
}) {
  return (
    <Button asChild variant="outline" className="justify-between">
      <Link href={href}>
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {label}
        </span>
        <ArrowRight className="h-4 w-4" />
      </Link>
    </Button>
  );
}
