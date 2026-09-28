import Link from "next/link";
import { Laptop, Link2, MousePointerClick, ShoppingBag, Smartphone, Tablet, UserPlus } from "lucide-react";
import type { Prisma, ReferralEvent } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { getAffiliateNavCounts } from "@/lib/affiliate-overview";
import { conversionRate } from "@/lib/affiliate-dashboard";
import { Badge } from "@/components/ui/badge";
import { TabBar } from "@/components/ui/tab-bar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel } from "@/components/dashboard/panel";
import { StatCard } from "@/components/dashboard/stat-card";
import { AffiliateNav } from "@/components/affiliate/affiliate-nav";
import { Pagination, parsePage } from "@/components/ui/pagination";

export const metadata = { title: "Referrals · My Landing" };

const PAGE_SIZE = 50;
const WINDOW_DAYS = 30;
const EVENTS: ReferralEvent[] = ["CLICK", "LEAD", "SALE"];
const EVENT_META: Record<ReferralEvent, { label: string; icon: typeof MousePointerClick; dot: string }> = {
  CLICK: { label: "Click", icon: MousePointerClick, dot: "before:bg-kv-subtle" },
  LEAD: { label: "Lead", icon: UserPlus, dot: "before:bg-sky-500" },
  SALE: { label: "Sale", icon: ShoppingBag, dot: "" },
};

function DeviceIcon({ type }: { type: string | null }) {
  const Icon = type === "mobile" ? Smartphone : type === "tablet" ? Tablet : Laptop;
  return <Icon className="h-[13px] w-[13px] text-kv-muted-fg" aria-label={type ?? "desktop"} />;
}

function shortUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.hostname.replace(/^www\./, "")}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value.slice(0, 60);
  }
}

export default async function AffiliateReferralsPage({
  searchParams,
}: {
  searchParams?: { page?: string; event?: string; affiliate?: string };
}) {
  const { workspace } = await requireCurrentWorkspace();
  const page = parsePage(searchParams?.page);
  const event = EVENTS.find((item) => item === searchParams?.event);
  const affiliateId = searchParams?.affiliate?.slice(0, 40) || undefined;
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);

  // Bot traffic is kept for audit but never shown or counted.
  const where: Prisma.ReferralWhereInput = {
    workspaceId: workspace.id,
    isBot: false,
    ...(event ? { event } : {}),
    ...(affiliateId ? { affiliateId } : {}),
  };

  const [referrals, total, recent, byEvent, botCount, affiliateFilter, navCounts] = await Promise.all([
    prisma.referral.findMany({
      where,
      include: {
        affiliate: { select: { id: true, referralCode: true, customer: { select: { name: true } } } },
        order: { select: { id: true, orderNumber: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.referral.count({ where }),
    prisma.referral.groupBy({
      by: ["event"],
      where: { workspaceId: workspace.id, isBot: false, createdAt: { gte: since }, ...(affiliateId ? { affiliateId } : {}) },
      _count: { _all: true },
    }),
    prisma.referral.groupBy({
      by: ["event"],
      where: { workspaceId: workspace.id, isBot: false, ...(affiliateId ? { affiliateId } : {}) },
      _count: { _all: true },
    }),
    prisma.referral.count({ where: { workspaceId: workspace.id, isBot: true, createdAt: { gte: since } } }),
    affiliateId
      ? prisma.affiliate.findFirst({
          where: { id: affiliateId, workspaceId: workspace.id },
          select: { id: true, customer: { select: { name: true } } },
        })
      : Promise.resolve(null),
    getAffiliateNavCounts(workspace.id),
  ]);

  const recentCount = { CLICK: 0, LEAD: 0, SALE: 0 };
  for (const row of recent) recentCount[row.event] = row._count._all;
  const allCount = new Map(byEvent.map((row) => [row.event, row._count._all]));
  const allTotal = byEvent.reduce((sum, row) => sum + row._count._all, 0);

  const hrefFor = (next: { event?: ReferralEvent; affiliate?: string | null }) => {
    const params = new URLSearchParams();
    const e = "event" in next ? next.event : event;
    const a = "affiliate" in next ? next.affiliate : affiliateId;
    if (e) params.set("event", e);
    if (a) params.set("affiliate", a);
    const qs = params.toString();
    return qs ? `/dashboard/affiliate/referrals?${qs}` : "/dashboard/affiliate/referrals";
  };

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Affiliate"
        description="Every click, lead, and sale that came through a referral link."
      />
      <AffiliateNav {...navCounts} />

      <div className="mb-[16px] grid grid-cols-1 gap-[12px] sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label={`Clicks · ${WINDOW_DAYS} days`} value={recentCount.CLICK.toLocaleString()} delta={botCount ? `${botCount} bot clicks filtered out` : "Bots filtered out"} icon={MousePointerClick} />
        <StatCard index={1} label={`Leads · ${WINDOW_DAYS} days`} value={recentCount.LEAD.toLocaleString()} delta="Sign-ups and form leads" icon={UserPlus} />
        <StatCard index={2} label={`Sales · ${WINDOW_DAYS} days`} value={recentCount.SALE.toLocaleString()} delta={`${conversionRate(recentCount.SALE, recentCount.CLICK).toFixed(1)}% of clicks`} icon={ShoppingBag} />
        <StatCard index={3} label="All-time referrals" value={allTotal.toLocaleString()} delta={affiliateFilter ? `For ${affiliateFilter.customer.name}` : "Across every partner"} icon={Link2} />
      </div>

      {allTotal === 0 ? (
        <EmptyState
          icon={Link2}
          title="No referral activity yet"
          description="Visits through an affiliate's /r/ link show up here, followed by the leads and sales they turn into."
        />
      ) : (
        <Panel title="Referral log" icon={Link2}>
          <div className="flex flex-wrap items-center justify-between gap-[10px] border-b-[0.8px] border-kv-border p-[10px]">
            <TabBar
              ariaLabel="Filter referrals by event"
              active={event ?? "ALL"}
              items={[
                { key: "ALL", label: "All", href: hrefFor({ event: undefined }) },
                ...EVENTS.map((item) => ({
                  key: item,
                  label: `${EVENT_META[item].label}s`,
                  href: hrefFor({ event: item }),
                  count: allCount.get(item),
                })),
              ]}
            />
            {affiliateFilter ? (
              <Link
                href={hrefFor({ affiliate: null })}
                className="inline-flex items-center gap-[6px] rounded-[8px] border-[0.8px] border-kv-border bg-kv-secondary px-[8px] py-[4px] text-[12px] text-kv-secondary-fg hover:text-kv-fg"
              >
                Partner: <span className="font-medium text-kv-fg">{affiliateFilter.customer.name}</span> ✕
              </Link>
            ) : null}
          </div>
          {referrals.length === 0 ? (
            <p className="px-[16px] py-[36px] text-center text-[12px] text-kv-muted-fg">Nothing matches this filter.</p>
          ) : (
            <Table className="min-w-[880px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-[14px]">Event</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Landing page</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead className="pr-[14px]">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referrals.map((referral) => {
                  const meta = EVENT_META[referral.event];
                  const source = referral.utmSource || shortUrl(referral.referrer) || "Direct";
                  return (
                    <TableRow key={referral.id}>
                      <TableCell className="pl-[14px]">
                        <Badge variant="success" className={meta.dot}>{meta.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <Link href={hrefFor({ affiliate: referral.affiliate.id })} className="text-[13px] text-kv-fg hover:underline">
                          {referral.affiliate.customer.name}
                        </Link>
                        <p className="font-mono text-[11px] text-kv-muted-fg">/r/{referral.affiliate.referralCode}</p>
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        <p className="truncate text-[12px] text-kv-secondary-fg" title={referral.landingUrl ?? undefined}>
                          {shortUrl(referral.landingUrl) ?? "—"}
                        </p>
                        {referral.utmCampaign ? <p className="truncate text-[11px] text-kv-muted-fg">Campaign: {referral.utmCampaign}</p> : null}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-[6px] text-[12px] text-kv-secondary-fg">
                          <DeviceIcon type={referral.deviceType} />
                          <span className="max-w-[180px] truncate">{source}</span>
                        </span>
                        {referral.utmMedium ? <p className="text-[11px] text-kv-muted-fg">{referral.utmMedium}</p> : null}
                      </TableCell>
                      <TableCell className="text-[12px]">
                        {referral.order ? (
                          <Link href={`/dashboard/orders/${referral.order.id}`} className="text-kv-fg hover:underline">
                            {referral.order.orderNumber}
                          </Link>
                        ) : (
                          <span className="text-kv-subtle">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap pr-[14px] text-[12px] text-kv-muted-fg">
                        {referral.createdAt.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          <Pagination
            page={page}
            total={total}
            pageSize={PAGE_SIZE}
            basePath="/dashboard/affiliate/referrals"
            params={{ event, affiliate: affiliateId }}
          />
        </Panel>
      )}
    </div>
  );
}
