import { headers } from "next/headers";
import { Handshake } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { canInWorkspace } from "@/lib/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { AffiliateNav } from "@/components/affiliate/affiliate-nav";
import { Pagination, parsePage } from "@/components/ui/pagination";
import {
  AffiliatesTable,
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

export default async function AffiliatesPage({
  searchParams,
}: {
  searchParams?: { page?: string };
}) {
  const { workspace, role } = await requireCurrentWorkspace();
  const page = parsePage(searchParams?.page);

  const [affiliates, totalAffiliates] = await Promise.all([
    prisma.affiliate.findMany({
      where: { workspaceId: workspace.id },
      include: { customer: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.affiliate.count({ where: { workspaceId: workspace.id } }),
  ]);

  if (totalAffiliates === 0) {
    return (
      <div className="w-full min-w-0">
        <PageHeader
          title="Affiliate"
          description="Invite affiliates and pay a commission on every sale they refer."
        />
        <AffiliateNav />
        <Card><CardContent className="pt-6">
          <EmptyState
            icon={Handshake}
            title="No affiliates yet"
            description="Add the first affiliate below, or share the public application page."
          />
          <AffiliatesTable affiliates={[]} appOrigin={originFromHeaders()} canManage={canInWorkspace(role, "affiliate.manage")} />
        </CardContent></Card>
      </div>
    );
  }

  const ids = affiliates.map((a) => a.id);
  const [referrals, uniqueVisitors, commissionTotals] = await Promise.all([
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
      select: { affiliateId: true, visitorHash: true },
    }),
    prisma.commission.groupBy({
      by: ["affiliateId"],
      where: { affiliateId: { in: ids } },
      _sum: { amount: true },
    }),
  ]);

  const stats = new Map<string, { clicks: number; leads: number; sales: number }>();
  for (const r of referrals) {
    const entry = stats.get(r.affiliateId) ?? { clicks: 0, leads: 0, sales: 0 };
    if (r.event === "CLICK") entry.clicks += r._count._all;
    if (r.event === "LEAD") entry.leads += r._count._all;
    if (r.event === "SALE") entry.sales += r._count._all;
    stats.set(r.affiliateId, entry);
  }
  const earnedById = new Map(
    commissionTotals.map((c) => [c.affiliateId, c._sum.amount ?? 0])
  );
  const uniqueClicksById = new Map<string, number>();
  for (const visit of uniqueVisitors) {
    uniqueClicksById.set(visit.affiliateId, (uniqueClicksById.get(visit.affiliateId) ?? 0) + 1);
  }

  const rows: AffiliateRow[] = affiliates.map((a) => ({
    id: a.id,
    referralCode: a.referralCode,
    status: a.status,
    customer: a.customer,
    clicks: stats.get(a.id)?.clicks ?? 0,
    uniqueClicks: uniqueClicksById.get(a.id) ?? stats.get(a.id)?.clicks ?? 0,
    leads: stats.get(a.id)?.leads ?? 0,
    sales: stats.get(a.id)?.sales ?? 0,
    earned: earnedById.get(a.id) ?? 0,
    conversionRate: (uniqueClicksById.get(a.id) ?? stats.get(a.id)?.clicks ?? 0) > 0
      ? ((stats.get(a.id)?.sales ?? 0) / (uniqueClicksById.get(a.id) ?? stats.get(a.id)?.clicks ?? 1)) * 100
      : 0,
  }));

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Affiliate"
        description="Invite affiliates and pay a commission on every sale they refer."
      />
      <AffiliateNav />

      <Card className="min-w-0 max-w-full overflow-hidden">
        <CardContent className="pt-6">
          <AffiliatesTable
            affiliates={rows}
            appOrigin={originFromHeaders()}
            canManage={canInWorkspace(role, "affiliate.manage")}
          />
          <Pagination
            page={page}
            total={totalAffiliates}
            pageSize={PAGE_SIZE}
            basePath="/dashboard/affiliate"
          />
        </CardContent>
      </Card>
    </div>
  );
}
