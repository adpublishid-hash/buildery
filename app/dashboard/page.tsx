import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, Circle, CircleCheck, Eye, Percent, Plus, Rocket, Wallet } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace";
import { getOrCreateDefaultWebsite } from "@/lib/website";
import { canInWorkspace } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { ActivityFeed, type Activity } from "@/components/dashboard/activity-feed";
import { EmptyState } from "@/components/dashboard/empty-state";
import { OverviewControls, type OverviewRange } from "@/components/dashboard/overview-controls";
import { PageHeader } from "@/components/dashboard/page-header";
import { PagesTable } from "@/components/dashboard/pages-table";
import { Panel } from "@/components/dashboard/panel";
import { StatCard } from "@/components/dashboard/stat-card";
import { TrendChart, type TrendPoint, type TrendSummary } from "@/components/dashboard/trend-chart";
import { dayLabel, eachDayKey, resolveRange } from "@/lib/analytics-range";
import { cachedAnalytics } from "@/lib/analytics-cache";
import { analyticsDailySeries } from "@/lib/analytics-rollup";
import {
  changeTrend,
  countDistinctVisitors,
  formatRate,
  percentChange,
  previousRange,
  visitorConversionRate,
  type Change,
} from "@/lib/analytics-metrics";
import { publicSiteDisplayUrl, publicSiteHref } from "@/lib/public-url";
import { cn, formatPrice } from "@/lib/utils";

export const metadata = { title: "Ringkasan · My Landing" };

const PAID = ["PAID", "PROCESSING", "COMPLETED"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

const COMPARE_LABEL: Record<OverviewRange, string> = {
  today: "vs kemarin",
  "7d": "vs 7 hari sebelumnya",
  "30d": "vs 30 hari sebelumnya",
};

type Window = { from: Date; to: Date };

/**
 * Visitors, orders and net revenue for one window — the same definitions the
 * analytics page uses (lib/analytics-metrics.ts), so the numbers agree.
 */
async function canonicalTotals(workspaceId: string, window: Window) {
  const range = { gte: window.from, lte: window.to };
  const [visitors, orders, revenueAgg, refundAgg] = await Promise.all([
    cachedAnalytics(["visitors", workspaceId, window.from.toISOString(), window.to.toISOString()], () =>
      countDistinctVisitors({ workspaceId, ...window })
    ),
    prisma.order.count({ where: { workspaceId, createdAt: range } }),
    prisma.order.aggregate({
      where: { workspaceId, status: { in: [...PAID] }, createdAt: range },
      _sum: { total: true },
    }),
    prisma.orderRefund.aggregate({
      where: {
        workspaceId,
        status: "REFUNDED",
        OR: [{ refundedAt: range }, { refundedAt: null, createdAt: range }],
      },
      _sum: { amount: true },
    }),
  ]);
  return {
    visitors,
    orders,
    revenue: Math.max(0, (revenueAgg._sum.total ?? 0) - (refundAgg._sum.amount ?? 0)),
  };
}

function changeText(change: Change, compare: string, fallback: string) {
  if (!change) return fallback;
  if (change.direction === "flat") return `0% ${compare}`;
  const sign = change.direction === "up" ? "+" : "−";
  const value = change.percent >= 100 ? Math.round(change.percent) : change.percent.toFixed(1);
  return `${sign}${value}% ${compare}`;
}

function signedPercent(change: Change) {
  if (!change) return null;
  if (change.direction === "flat") return 0;
  return change.direction === "up" ? change.percent : -change.percent;
}

function dayKeyIn(date: Date, timeZone: string) {
  // en-CA formats as YYYY-MM-DD.
  return date.toLocaleDateString("en-CA", { timeZone });
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { range?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const name = session.user.name?.split(" ")[0] ?? "there";
  const current = await getCurrentWorkspace(session.user.id);

  if (!current) {
    return (
      <div className="w-full">
        <PageHeader
          title={
            <>
              Selamat datang, {name}
              <span aria-hidden className="inline-block origin-[70%_70%] animate-kv-wave">
                👋
              </span>
            </>
          }
          description="Siapkan workspace pertama untuk mulai membuat website."
        />
        <EmptyState
          icon={Boxes}
          title="Belum ada workspace"
          description="Workspace adalah pusat bisnis untuk website, produk, anggota, dan data. Buat satu untuk memulai."
          action={
            <Button asChild>
              <Link href="/onboarding">
                <Plus /> Mulai onboarding
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const workspace = current.workspace;
  const workspaceId = workspace.id;
  const timeZone = workspace.timezone || "Asia/Jakarta";
  const rangeKeyParam: OverviewRange =
    searchParams?.range === "today" || searchParams?.range === "30d" ? searchParams.range : "7d";
  const range = resolveRange({ range: rangeKeyParam });
  const before = previousRange(range);
  // One day is one bar; "today" still charts the week so the trend has a shape.
  const chartRange = rangeKeyParam === "today" ? resolveRange({ range: "7d" }) : range;
  const chartBefore = previousRange(chartRange);
  const compare = COMPARE_LABEL[rangeKeyParam];
  const chartCompare = COMPARE_LABEL[rangeKeyParam === "today" ? "7d" : rangeKeyParam];

  const website = await getOrCreateDefaultWebsite(workspaceId);
  const canEditContent = canInWorkspace(current.role, "content.edit");
  const feedFrom = new Date(Date.now() - 7 * DAY_MS);

  const [
    now,
    prev,
    chartNow,
    chartPrev,
    series,
    prevSeries,
    memberCount,
    pageCount,
    publishedPageCount,
    recentPages,
    orders,
    submissions,
    enrollments,
    auditLogs,
  ] = await Promise.all([
    canonicalTotals(workspaceId, range),
    canonicalTotals(workspaceId, before),
    rangeKeyParam === "today" ? canonicalTotals(workspaceId, chartRange) : null,
    rangeKeyParam === "today" ? canonicalTotals(workspaceId, chartBefore) : null,
    analyticsDailySeries({ workspaceId, from: chartRange.from, to: chartRange.to }),
    analyticsDailySeries({ workspaceId, from: chartBefore.from, to: chartBefore.to }),
    prisma.workspaceMember.count({ where: { workspaceId } }),
    prisma.page.count({ where: { websiteId: website.id } }),
    prisma.page.count({ where: { websiteId: website.id, status: "PUBLISHED" } }),
    prisma.page.findMany({
      where: { websiteId: website.id },
      include: { _count: { select: { blocks: true } } },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.order.findMany({
      where: { workspaceId, createdAt: { gte: feedFrom } },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        total: true,
        createdAt: true,
        customerNameSnapshot: true,
        customer: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.formSubmission.findMany({
      where: { workspaceId, createdAt: { gte: feedFrom } },
      select: { id: true, formId: true, createdAt: true, form: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.enrollment.findMany({
      where: { workspaceId, enrolledAt: { gte: feedFrom } },
      select: {
        id: true,
        courseId: true,
        enrolledAt: true,
        customer: { select: { name: true } },
        course: { select: { title: true } },
      },
      orderBy: { enrolledAt: "desc" },
      take: 25,
    }),
    prisma.workspaceAuditLog.findMany({
      where: { workspaceId, createdAt: { gte: feedFrom } },
      select: {
        id: true,
        action: true,
        summary: true,
        createdAt: true,
        actor: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  // ── KPI cards ──────────────────────────────────────────────────────────
  const dayKeys = eachDayKey(chartRange.from, chartRange.to);
  const row = (key: string) => series.get(key);
  const sparkVisitors = dayKeys.map((k) => row(k)?.visitors ?? 0);
  const sparkRevenue = dayKeys.map((k) => row(k)?.revenue ?? 0);
  const sparkOrders = dayKeys.map((k) => row(k)?.orders ?? 0);

  const visitorsChange = percentChange(now.visitors, prev.visitors);
  const revenueChange = percentChange(now.revenue, prev.revenue);
  const rate = visitorConversionRate(now.orders, now.visitors);
  const prevRate = visitorConversionRate(prev.orders, prev.visitors);
  const rateChange = percentChange(rate, prevRate);

  // ── Trend chart ────────────────────────────────────────────────────────
  const points: TrendPoint[] = dayKeys.map((key) => ({
    label: dayLabel(key),
    values: {
      pageViews: row(key)?.pageViews ?? 0,
      visitors: row(key)?.visitors ?? 0,
      orders: row(key)?.orders ?? 0,
      revenue: row(key)?.revenue ?? 0,
    },
  }));
  const chartTotals = chartNow ?? now;
  const chartPrevTotals = chartPrev ?? prev;
  const sumViews = (map: typeof series) =>
    Array.from(map.values()).reduce((sum, r) => sum + r.pageViews, 0);
  const summary: TrendSummary = {
    visitors: {
      total: chartTotals.visitors,
      change: signedPercent(percentChange(chartTotals.visitors, chartPrevTotals.visitors)),
    },
    pageViews: {
      total: sumViews(series),
      change: signedPercent(percentChange(sumViews(series), sumViews(prevSeries))),
    },
    orders: {
      total: chartTotals.orders,
      change: signedPercent(percentChange(chartTotals.orders, chartPrevTotals.orders)),
    },
    revenue: {
      total: chartTotals.revenue,
      change: signedPercent(percentChange(chartTotals.revenue, chartPrevTotals.revenue)),
    },
  };

  // ── Activity feed ──────────────────────────────────────────────────────
  const todayKey = dayKeyIn(new Date(), timeZone);
  const stamp = (at: Date) => {
    const daysAgo = Math.round(
      (Date.parse(todayKey) - Date.parse(dayKeyIn(at, timeZone))) / DAY_MS
    );
    const clock = at.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone });
    const time =
      daysAgo <= 1
        ? clock
        : at.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone });
    return { daysAgo, time, ts: at.getTime() };
  };

  const feed: Array<Activity & { ts: number }> = [
    ...orders.map((o) => {
      const paid = (PAID as readonly string[]).includes(o.status);
      return {
        id: `order-${o.id}`,
        kind: paid ? ("paid" as const) : ("order" as const),
        title: paid ? "Order Dibayar" : "Order Masuk",
        body: [
          { strong: o.customerNameSnapshot || o.customer?.name || "Pelanggan" },
          " · ",
          { strong: `#${o.orderNumber}` },
          ` · ${formatPrice(o.total)}`,
        ],
        href: `/dashboard/orders/${o.id}`,
        ...stamp(o.createdAt),
      };
    }),
    ...submissions.map((s) => ({
      id: `form-${s.id}`,
      kind: "form" as const,
      title: "Form Terisi",
      body: ["Kiriman baru di ", { strong: s.form.title }],
      href: `/dashboard/forms/${s.formId}/submissions`,
      ...stamp(s.createdAt),
    })),
    ...enrollments.map((e) => ({
      id: `enroll-${e.id}`,
      kind: "enrollment" as const,
      title: "Pendaftaran Kursus",
      body: [{ strong: e.customer.name }, " mendaftar ", { strong: e.course.title }],
      href: `/dashboard/courses/${e.courseId}/students`,
      ...stamp(e.enrolledAt),
    })),
    ...auditLogs.map((log) => ({
      id: `audit-${log.id}`,
      kind: "team" as const,
      title: auditTitle(log.action),
      body: [{ strong: log.actor?.name ?? log.actor?.email ?? "Sistem" }, " → ", log.summary],
      ...stamp(log.createdAt),
    })),
  ]
    .filter((a) => a.daysAgo >= 0 && a.daysAgo < 7)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 60);
  const activities: Activity[] = feed.map((a) => ({
    id: a.id,
    kind: a.kind,
    title: a.title,
    body: a.body,
    time: a.time,
    daysAgo: a.daysAgo,
    href: a.href,
  }));

  // ── Pages & checklist ──────────────────────────────────────────────────
  const publicUrl = publicSiteDisplayUrl(workspace.slug);
  const publicHref = publicSiteHref(workspace.slug);
  const pageRows = recentPages.map((page) => ({
    id: page.id,
    title: page.title,
    slug: page.slug,
    status: page.status,
    blocks: page._count.blocks,
    updatedAt: page.updatedAt.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone,
    }),
    updatedAtTs: page.updatedAt.getTime(),
    viewHref: publicSiteHref(workspace.slug, page.slug === "home" ? "" : page.slug),
  }));

  const checklist = [
    { label: "Buat workspace", done: true },
    {
      label: "Atur branding",
      done: Boolean(workspace.logoUrl || workspace.primaryColor),
      href: "/dashboard/settings?tab=tampilan",
    },
    { label: "Buat halaman pertama", done: pageCount > 0, href: "/dashboard/pages/new" },
    { label: "Publish satu halaman", done: publishedPageCount > 0, href: "/dashboard/pages" },
    { label: "Undang anggota tim", done: memberCount > 1, href: "/dashboard/settings?tab=anggota" },
  ];
  const checklistDone = checklist.filter((c) => c.done).length;

  return (
    <div className="flex w-full min-w-0 flex-col gap-[16px]">
      <PageHeader
        className="pb-0"
        title={
          <>
            Halo, {name}
            <span aria-hidden className="inline-block origin-[70%_70%] animate-kv-wave">
              👋
            </span>
          </>
        }
        description={`Berikut insight terbaru dari ${workspace.name} · ${publicUrl}`}
        action={<OverviewControls range={rangeKeyParam} publicHref={publicHref} />}
      />

      <div className="flex w-full min-w-0 flex-col gap-[12px]">
        <div className="flex w-full min-w-0 flex-col gap-[12px] min-[1400px]:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-[12px]">
            <div className="grid w-full grid-cols-1 gap-[12px] sm:grid-cols-3">
              <StatCard
                index={0}
                label="Pengunjung"
                value={now.visitors.toLocaleString("id-ID")}
                delta={changeText(visitorsChange, compare, "Belum ada pembanding")}
                trend={changeTrend(visitorsChange)}
                icon={Eye}
                spark={sparkVisitors}
              />
              <StatCard
                index={1}
                label="Pendapatan Bersih"
                value={formatPrice(now.revenue)}
                delta={changeText(revenueChange, compare, "Sudah dikurangi refund")}
                trend={changeTrend(revenueChange)}
                icon={Wallet}
                spark={sparkRevenue}
              />
              <StatCard
                index={2}
                label="Konversi"
                value={formatRate(rate)}
                delta={changeText(rateChange, compare, `${now.orders} order`)}
                trend={changeTrend(rateChange)}
                icon={Percent}
                spark={sparkOrders}
              />
            </div>
            <TrendChart points={points} summary={summary} compareLabel={chartCompare} />
          </div>
          <ActivityFeed
            activities={activities}
            className="w-full shrink-0 min-[1400px]:w-[332px]"
          />
        </div>

        <PagesTable
          pages={pageRows}
          canEdit={canEditContent}
          subtitle={`${publishedPageCount}/${pageCount} publish`}
        />

        {checklistDone < checklist.length ? (
          <Panel
            title={
              <>
                Mulai Cepat{" "}
                <span className="font-normal text-kv-muted-fg">
                  · {checklistDone}/{checklist.length} selesai
                </span>
              </>
            }
            icon={Rocket}
            iconPosition="left"
            className="animate-kv-rise [animation-delay:400ms]"
            bodyClassName="grid grid-cols-1 gap-[6px] p-[8px] sm:grid-cols-2 lg:grid-cols-5"
          >
            {checklist.map((item) => {
              const inner = (
                <>
                  {item.done ? (
                    <CircleCheck className="h-[16px] w-[16px] shrink-0 text-kv-success" strokeWidth={1.8} />
                  ) : (
                    <Circle className="h-[16px] w-[16px] shrink-0 text-kv-subtle" strokeWidth={1.8} />
                  )}
                  <span className={cn("truncate", item.done && "text-kv-subtle line-through")}>
                    {item.label}
                  </span>
                </>
              );
              const cls =
                "flex h-[32px] min-w-0 items-center gap-[8px] rounded-[8px] border-[0.8px] border-kv-border bg-kv-card px-[10px] text-[13px] leading-none text-kv-secondary-fg";
              return item.done || !item.href ? (
                <div key={item.label} className={cls}>
                  {inner}
                </div>
              ) : (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    cls,
                    "transition-[box-shadow,transform,color] duration-200 hover:-translate-y-px hover:text-kv-fg hover:shadow-kv-hover"
                  )}
                >
                  {inner}
                </Link>
              );
            })}
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

function auditTitle(action: string) {
  const group = action.split(".")[0];
  switch (group) {
    case "member":
      return "Anggota Tim";
    case "settings":
      return "Pengaturan Diubah";
    case "workspace":
      return "Workspace Diperbarui";
    case "template":
      return "Template";
    case "subscription":
      return "Langganan";
    default:
      return "Aktivitas Tim";
  }
}
