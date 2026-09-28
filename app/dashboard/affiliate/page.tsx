import Link from "next/link";
import { headers } from "next/headers";
import {
  ArrowRight,
  Coins,
  Eye,
  Handshake,
  Inbox,
  MousePointerClick,
  ShoppingBag,
  Users,
} from "lucide-react";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { canInWorkspace } from "@/lib/permissions";
import { ensureAffiliateProgram } from "@/lib/actions/affiliate";
import { getAffiliateNavCounts } from "@/lib/affiliate-overview";
import {
  buildAffiliatePerformance,
  conversionRate,
  countAffiliateStatuses,
  performanceFor,
  summarizeCommissions,
} from "@/lib/affiliate-dashboard";
import { isAffiliateStatus } from "@/lib/affiliate-status";
import { publicSiteHref } from "@/lib/public-url";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel } from "@/components/dashboard/panel";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";
import { StatCard } from "@/components/dashboard/stat-card";
import { CopyLinkButton } from "@/components/dashboard/copy-link-button";
import { AffiliateNav } from "@/components/affiliate/affiliate-nav";
import { AddAffiliateButton } from "@/components/affiliate/add-affiliate-dialog";
import { ProgramOpenToggle } from "@/components/affiliate/program-open-toggle";
import { Pagination, parsePage } from "@/components/ui/pagination";
import {
  AffiliatesTable,
  type AffiliateFilters,
  type AffiliateRow,
} from "@/components/affiliate/affiliates-table";

export const metadata = { title: "Affiliate · My Landing" };

function originFromHeaders() {
  const h = headers();
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : "";
}

const PAGE_SIZE = 50;
const WINDOW_DAYS = 30;

export default async function AffiliatesPage({
  searchParams,
}: {
  searchParams?: { page?: string; q?: string; status?: string };
}) {
  const { workspace, role } = await requireCurrentWorkspace();
  const canManage = canInWorkspace(role, "affiliate.manage");
  const page = parsePage(searchParams?.page);
  const filters: AffiliateFilters = {
    q: searchParams?.q?.trim().slice(0, 100) ?? "",
    status: isAffiliateStatus(searchParams?.status) ? searchParams.status : "ALL",
  };
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);

  const where: Prisma.AffiliateWhereInput = {
    workspaceId: workspace.id,
    // "All" is the working list; archived affiliates live under their own tab.
    status: filters.status === "ALL" ? { not: "ARCHIVED" } : filters.status,
    ...(filters.q
      ? {
          OR: [
            { customer: { name: { contains: filters.q, mode: "insensitive" } } },
            { customer: { email: { contains: filters.q, mode: "insensitive" } } },
            { referralCode: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [
    program,
    affiliates,
    matchingCount,
    statusRows,
    recentReferrals,
    commissionTotals,
    creativeCount,
    navCounts,
  ] = await Promise.all([
    ensureAffiliateProgram(workspace.id),
    prisma.affiliate.findMany({
      where,
      include: { customer: { select: { name: true, email: true } } },
      // Enum order puts PENDING first, so applications to review lead the list.
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.affiliate.count({ where }),
    prisma.affiliate.groupBy({
      by: ["status"],
      where: { workspaceId: workspace.id },
      _count: { _all: true },
    }),
    prisma.referral.groupBy({
      by: ["event"],
      where: { workspaceId: workspace.id, isBot: false, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.commission.groupBy({
      by: ["status"],
      where: { workspaceId: workspace.id },
      _sum: { amount: true, adjustedAmount: true },
    }),
    prisma.affiliateCreative.count({ where: { workspaceId: workspace.id } }),
    getAffiliateNavCounts(workspace.id),
  ]);

  const counts = countAffiliateStatuses(statusRows);
  const totalAffiliates = Object.entries(counts)
    .filter(([key]) => key !== "ALL")
    .reduce((sum, [, value]) => sum + value, 0);
  const recent = { CLICK: 0, LEAD: 0, SALE: 0 };
  for (const row of recentReferrals) recent[row.event] += row._count._all;
  const commissions = summarizeCommissions(commissionTotals);
  const unpaid = commissions.pending + commissions.approved + commissions.scheduled;
  const applicationUrl = publicSiteHref(workspace.slug, "affiliates");

  const programSummary = (
    <div className="flex flex-wrap items-center gap-[6px]">
      <Badge variant="outline">{program.commissionPercent}% commission</Badge>
      <Badge variant="outline">
        {program.attributionDays}-day {program.attributionModel === "FIRST_CLICK" ? "first" : "last"}-click
      </Badge>
      <Badge variant="success" className={program.isOpen ? undefined : "before:bg-kv-subtle"}>
        {program.isOpen
          ? program.approvalMode === "AUTO"
            ? "Open · auto-approve"
            : "Open · manual review"
          : "Applications closed"}
      </Badge>
    </div>
  );

  const header = (
    <PageHeader
      title="Affiliate"
      description="Invite affiliates and pay a commission on every sale they refer."
      action={
        <>
          {canManage ? <ProgramOpenToggle isOpen={program.isOpen} /> : null}
          <Button asChild variant="outline">
            <Link href={applicationUrl} target="_blank">
              <Eye /> Application page
            </Link>
          </Button>
          {canManage ? <AddAffiliateButton commissionPercent={program.commissionPercent} /> : null}
        </>
      }
    />
  );

  if (totalAffiliates === 0) {
    return (
      <div className="w-full min-w-0">
        {header}
        <AffiliateNav {...navCounts} />
        <div className="flex flex-col gap-[16px]">
          <SetupChecklist
            title="Launch your affiliate program"
            icon={Handshake}
            steps={[
              {
                label: "Describe your program",
                description: `Pays ${program.commissionPercent}% after a ${program.holdDays}-day refund hold. Add a description and terms for applicants.`,
                done: Boolean(program.description?.trim() || program.terms?.trim()),
                href: canManage ? "/dashboard/affiliate/program" : undefined,
              },
              {
                label: "Open applications",
                description: "Let people apply from your public affiliate page.",
                done: program.isOpen,
                href: canManage ? "/dashboard/affiliate/program" : undefined,
              },
              {
                label: "Add campaign materials",
                description: "Links, banners, and copy affiliates can reuse.",
                done: creativeCount > 0,
                href: canManage ? "/dashboard/affiliate/program#materials" : undefined,
              },
              {
                label: "Recruit the first affiliate",
                description: "Add someone directly or share the application link.",
                done: false,
              },
            ]}
          />
          <Panel title="Affiliates" icon={Users} action={programSummary}>
            <EmptyState
              icon={Handshake}
              title="No affiliates yet"
              description="Affiliates share a personal referral link and earn a commission on every sale it brings in. Add one yourself, or share your application page so people can apply."
              className="rounded-none border-0"
              action={
                <div className="flex flex-wrap items-center justify-center gap-[8px]">
                  <CopyLinkButton
                    href={applicationUrl}
                    label="Copy application link"
                    toastMessage="Application link copied"
                  />
                  {canManage ? (
                    <AddAffiliateButton
                      label="Add first affiliate"
                      commissionPercent={program.commissionPercent}
                    />
                  ) : null}
                </div>
              }
            />
          </Panel>
        </div>
      </div>
    );
  }

  const ids = affiliates.map((a) => a.id);
  const [referrals, uniqueVisitors, affiliateCommissions] = ids.length
    ? await Promise.all([
        prisma.referral.groupBy({
          by: ["affiliateId", "event"],
          where: { affiliateId: { in: ids }, isBot: false },
          _count: { _all: true },
        }),
        prisma.referral.findMany({
          where: {
            affiliateId: { in: ids },
            event: "CLICK",
            isBot: false,
            visitorHash: { not: null },
          },
          distinct: ["affiliateId", "visitorHash"],
          select: { affiliateId: true },
        }),
        prisma.commission.groupBy({
          by: ["affiliateId", "status"],
          where: { affiliateId: { in: ids } },
          _sum: { amount: true },
        }),
      ])
    : [[], [], []];

  const performance = buildAffiliatePerformance({
    referrals,
    uniqueVisitors,
    commissions: affiliateCommissions,
  });

  const rows: AffiliateRow[] = affiliates.map((a) => ({
    id: a.id,
    referralCode: a.referralCode,
    status: a.status,
    customer: a.customer,
    joinedAt: a.approvedAt ?? a.appliedAt,
    rejectionReason: a.rejectionReason,
    hasPayoutAccount: Boolean(a.payoutDetailsEncrypted),
    commissionPercent: a.commissionPercent,
    ...performanceFor(performance, a.id),
  }));

  return (
    <div className="w-full min-w-0">
      {header}
      <AffiliateNav {...navCounts} />

      <div className="mb-[16px] grid grid-cols-1 gap-[12px] sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          index={0}
          label="Active affiliates"
          value={counts.ACTIVE}
          delta={counts.PENDING ? `${counts.PENDING} waiting for review` : `${totalAffiliates} in total`}
          icon={Users}
        />
        <StatCard
          index={1}
          label={`Clicks · ${WINDOW_DAYS} days`}
          value={recent.CLICK.toLocaleString()}
          delta={`${recent.LEAD.toLocaleString()} ${recent.LEAD === 1 ? "lead" : "leads"} captured`}
          icon={MousePointerClick}
        />
        <StatCard
          index={2}
          label={`Referred sales · ${WINDOW_DAYS} days`}
          value={recent.SALE.toLocaleString()}
          delta={`${conversionRate(recent.SALE, recent.CLICK).toFixed(1)}% of clicks convert`}
          icon={ShoppingBag}
        />
        <StatCard
          index={3}
          label="Unpaid commission"
          value={formatPrice(unpaid)}
          delta={`${formatPrice(commissions.paid)} paid out`}
          icon={Coins}
        />
      </div>

      {canManage && counts.PENDING > 0 && filters.status !== "PENDING" ? (
        <div className="mb-[16px] flex animate-kv-rise flex-wrap items-center justify-between gap-[10px] rounded-[12px] border-[0.8px] border-amber-200 bg-amber-50/70 px-[14px] py-[10px]">
          <div className="flex min-w-0 items-center gap-[10px]">
            <span className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px] border-[0.8px] border-amber-200 bg-white text-amber-600">
              <Inbox className="h-[14px] w-[14px]" />
            </span>
            <p className="text-[13px] text-amber-900">
              <span className="font-semibold">
                {counts.PENDING} {counts.PENDING === 1 ? "application is" : "applications are"}
              </span>{" "}
              waiting for your review.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/affiliate?status=PENDING">
              Review now <ArrowRight />
            </Link>
          </Button>
        </div>
      ) : null}

      <Panel title="Affiliates" icon={Users} action={programSummary}>
        <AffiliatesTable
          affiliates={rows}
          appOrigin={originFromHeaders()}
          canManage={canManage}
          filters={filters}
          counts={counts}
          matchingCount={matchingCount}
          programPercent={program.commissionPercent}
        />
        <Pagination
          page={page}
          total={matchingCount}
          pageSize={PAGE_SIZE}
          basePath="/dashboard/affiliate"
          params={{
            q: filters.q || undefined,
            status: filters.status !== "ALL" ? filters.status : undefined,
          }}
        />
      </Panel>
    </div>
  );
}
