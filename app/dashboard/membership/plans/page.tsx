import Link from "next/link";
import { CreditCard, Eye, LockKeyhole, Trophy, Users } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { publicSiteHref } from "@/lib/public-url";
import { formatPrice } from "@/lib/utils";
import { MEMBERSHIP_LEVEL_LABEL } from "@/lib/labels";
import { summarizePlans } from "@/lib/membership-dashboard";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { MembershipNav } from "@/components/membership/membership-nav";
import { PlansTable } from "@/components/membership/plans-table";

export const metadata = { title: "Membership plans · My Landing" };

export default async function MembershipPlansPage() {
  const { workspace } = await requireCurrentWorkspace();
  const now = new Date();

  const [plans, products, activeByPlan, expiringSoon] = await Promise.all([
    prisma.membershipPlan.findMany({
      where: { workspaceId: workspace.id },
      include: {
        product: { select: { name: true, price: true, type: true } },
        _count: { select: { memberships: true } },
      },
      orderBy: [{ archivedAt: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.product.findMany({
      where: {
        workspaceId: workspace.id,
        type: { in: ["PHYSICAL", "DIGITAL"] },
      },
      select: { id: true, name: true, price: true, type: true },
      orderBy: { name: "asc" },
    }),
    prisma.customerMembership.groupBy({
      by: ["planId"],
      where: {
        workspaceId: workspace.id,
        status: "ACTIVE",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      _count: { _all: true },
    }),
    prisma.customerMembership.count({
      where: {
        workspaceId: workspace.id,
        status: "ACTIVE",
        expiresAt: { gt: now, lte: new Date(now.getTime() + 14 * 86_400_000) },
      },
    }),
  ]);

  const activeCount = new Map(activeByPlan.map((row) => [row.planId, row._count._all]));
  const rows = plans.map((plan) => ({
    ...plan,
    memberCount: plan._count.memberships,
    activeMemberCount: activeCount.get(plan.id) ?? 0,
  }));
  const summary = summarizePlans(rows.map((row) => ({ ...row, activeMembers: row.activeMemberCount })));
  const publicUrl = publicSiteHref(workspace.slug, "memberships");

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Membership"
        description="Plans bundle access at a given level — Free, Basic, or Premium."
        action={
          <Button asChild variant="outline">
            <Link href={publicUrl} target="_blank">
              <Eye className="h-4 w-4" />
              Public page
            </Link>
          </Button>
        }
      />
      <MembershipNav expiringSoon={expiringSoon} />

      <div className="mb-[16px] grid grid-cols-1 gap-[12px] sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          index={0}
          label="Plans"
          value={summary.total}
          delta={
            summary.total
              ? `${summary.active} live · ${summary.total - summary.active} hidden`
              : "Pick a template below"
          }
          icon={CreditCard}
        />
        <StatCard
          index={1}
          label="Active members"
          value={summary.activeMembers.toLocaleString()}
          delta="With access right now"
          icon={Users}
        />
        <StatCard
          index={2}
          label="Paid plans"
          value={summary.paid}
          delta={summary.cheapestPaid !== null ? `From ${formatPrice(summary.cheapestPaid)}` : "No paid tier yet"}
          icon={LockKeyhole}
        />
        <StatCard
          index={3}
          label="Top plan"
          value={summary.top?.name ?? "—"}
          delta={
            summary.top
              ? `${summary.top.name === MEMBERSHIP_LEVEL_LABEL[summary.top.level] ? "" : `${MEMBERSHIP_LEVEL_LABEL[summary.top.level]} · `}${summary.top.activeMembers} active ${summary.top.activeMembers === 1 ? "member" : "members"}`
              : "No active members yet"
          }
          icon={Trophy}
        />
      </div>

      <PlansTable plans={rows} products={products} publicUrl={publicUrl} />
    </div>
  );
}
