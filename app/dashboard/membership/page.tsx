import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  CreditCard,
  Eye,
  LockKeyhole,
  RefreshCw,
  Rocket,
  Users,
  Wallet,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { publicSiteHref } from "@/lib/public-url";
import { formatDate, formatPrice } from "@/lib/utils";
import { MEMBERSHIP_LEVEL_LABEL } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel } from "@/components/dashboard/panel";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";
import { StatCard } from "@/components/dashboard/stat-card";
import { MembershipNav } from "@/components/membership/membership-nav";

export const metadata = { title: "Membership · My Landing" };

const DAY_MS = 86_400_000;
const EXPIRING_DAYS = 14;

export default async function MembershipOverviewPage() {
  const { workspace } = await requireCurrentWorkspace();
  const now = new Date();
  const expiringWindow = {
    workspaceId: workspace.id,
    status: "ACTIVE" as const,
    expiresAt: { gt: now, lte: new Date(now.getTime() + EXPIRING_DAYS * DAY_MS) },
  };

  const [
    plans,
    activeMemberRows,
    activeByPlan,
    allMemberRows,
    gatedCourses,
    paidMembershipRevenue,
    renewalCount,
    expiringSoon,
    expiringList,
  ] = await Promise.all([
    prisma.membershipPlan.findMany({
      where: { workspaceId: workspace.id, archivedAt: null },
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.customerMembership.findMany({
      where: {
        workspaceId: workspace.id,
        status: "ACTIVE",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      distinct: ["customerId"],
      select: { customerId: true },
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
    prisma.customerMembership.findMany({
      where: { workspaceId: workspace.id },
      distinct: ["customerId"],
      select: { customerId: true },
    }),
    prisma.course.count({
      where: { workspaceId: workspace.id, requiredLevel: { not: "FREE" } },
    }),
    prisma.payment.aggregate({
      where: {
        workspaceId: workspace.id,
        kind: "MEMBERSHIP",
        status: "PAID",
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.membershipGrant.count({
      where: { workspaceId: workspace.id, source: "RENEWAL" },
    }),
    prisma.customerMembership.count({ where: expiringWindow }),
    prisma.customerMembership.findMany({
      where: expiringWindow,
      include: {
        customer: { select: { name: true, email: true } },
        plan: { select: { name: true } },
      },
      orderBy: { expiresAt: "asc" },
      take: 6,
    }),
  ]);

  const activePlans = plans.filter((plan) => plan.isActive);
  const activeMembers = activeMemberRows.length;
  const totalMembers = allMemberRows.length;
  const activeRate = totalMembers ? Math.round((activeMembers / totalMembers) * 100) : 0;
  const activeCount = new Map(activeByPlan.map((row) => [row.planId, row._count._all]));
  const publicUrl = publicSiteHref(workspace.slug, "memberships");

  const steps = [
    {
      label: "Create a plan",
      description: "Free, Basic, or Premium access for a set time.",
      done: plans.length > 0,
      href: "/dashboard/membership/plans",
    },
    {
      label: "Publish it",
      description: "Make at least one plan live on your membership page.",
      done: activePlans.length > 0,
      href: "/dashboard/membership/plans",
    },
    {
      label: "Gate content",
      description: "Set a course's access level to Basic or Premium.",
      done: gatedCourses > 0,
      href: "/dashboard/courses",
    },
    {
      label: "Get your first member",
      description: "Share the membership page or assign someone.",
      done: activeMembers > 0,
      href: "/dashboard/membership/members?assign=1",
    },
  ];
  const setupDone = steps.every((step) => step.done);

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Membership"
        description="Sell tiered access, gate courses, and manage member accounts."
        action={
          <>
            <Button asChild variant="outline">
              <Link href={publicUrl} target="_blank">
                <Eye /> Public page
              </Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/membership/plans">
                Manage plans <ArrowRight />
              </Link>
            </Button>
          </>
        }
      />
      <MembershipNav expiringSoon={expiringSoon} />

      {!setupDone ? (
        <SetupChecklist title="Set up memberships" icon={Rocket} steps={steps} className="mb-[16px]" />
      ) : null}

      <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          index={0}
          label="Active members"
          value={activeMembers.toLocaleString()}
          delta={totalMembers ? `${activeRate}% of ${totalMembers} members ever` : "No members yet"}
          icon={Users}
        />
        <StatCard
          index={1}
          label="Membership revenue"
          value={formatPrice(paidMembershipRevenue._sum.amount ?? 0)}
          delta={`${paidMembershipRevenue._count._all} paid ${paidMembershipRevenue._count._all === 1 ? "purchase" : "purchases"}`}
          icon={Wallet}
        />
        <StatCard
          index={2}
          label="Renewals"
          value={renewalCount.toLocaleString()}
          delta="Access extended by members"
          icon={RefreshCw}
        />
        <StatCard
          index={3}
          label="Live plans"
          value={activePlans.length}
          delta={`${plans.length - activePlans.length} hidden`}
          icon={CreditCard}
        />
        <StatCard
          index={4}
          label="Gated courses"
          value={gatedCourses}
          delta="Basic or Premium access"
          icon={LockKeyhole}
        />
        <StatCard
          index={5}
          label="Expiring soon"
          value={expiringSoon}
          delta={`Within ${EXPIRING_DAYS} days`}
          icon={Clock3}
        />
      </div>

      <div className="mt-[16px] grid gap-[16px] lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel
          title="Plans"
          icon={CreditCard}
          action={
            plans.length ? (
              <Link href="/dashboard/membership/plans" className="text-[12px] text-kv-muted-fg hover:text-kv-fg">
                Manage →
              </Link>
            ) : null
          }
        >
          {plans.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No membership plans yet"
              description="Create Free, Basic, or Premium plans to unlock member-only experiences."
              className="rounded-none border-0"
              action={
                <Button asChild>
                  <Link href="/dashboard/membership/plans">Create plan</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y-[0.8px] divide-kv-border">
              {plans.slice(0, 6).map((plan) => (
                <li key={plan.id} className="flex items-center justify-between gap-[12px] px-[14px] py-[10px]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-[6px]">
                      <p className="text-[13px] font-medium text-kv-fg">{plan.name}</p>
                      <Badge variant="outline">{MEMBERSHIP_LEVEL_LABEL[plan.level]}</Badge>
                      {!plan.isActive ? (
                        <Badge variant="success" className="before:bg-kv-subtle">Hidden</Badge>
                      ) : null}
                    </div>
                    <p className="mt-[2px] truncate text-[12px] text-kv-muted-fg">
                      {plan.description || (plan.accessDays ? `${plan.accessDays} days of access` : "Lifetime access")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="kv-tabular text-[13px] font-medium text-kv-fg">
                      {plan.price === 0 ? "Free" : formatPrice(plan.price)}
                    </p>
                    <Link
                      href={`/dashboard/membership/members?plan=${plan.id}`}
                      className="kv-tabular text-[12px] text-kv-muted-fg hover:text-kv-fg hover:underline"
                    >
                      {activeCount.get(plan.id) ?? 0} active
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Expiring soon"
          icon={Clock3}
          action={
            expiringSoon > 0 ? (
              <Link
                href="/dashboard/membership/members?status=EXPIRING"
                className="text-[12px] text-kv-muted-fg hover:text-kv-fg"
              >
                View all →
              </Link>
            ) : null
          }
        >
          {expiringList.length === 0 ? (
            <p className="px-[16px] py-[32px] text-center text-[12px] leading-[1.5] text-kv-muted-fg">
              No memberships end in the next {EXPIRING_DAYS} days.
              <br />
              Members get reminder emails 14, 7, and 1 day before access ends.
            </p>
          ) : (
            <ul className="divide-y-[0.8px] divide-kv-border">
              {expiringList.map((membership) => {
                const daysLeft = Math.max(
                  1,
                  Math.ceil(((membership.expiresAt?.getTime() ?? now.getTime()) - now.getTime()) / DAY_MS)
                );
                return (
                  <li key={membership.id} className="flex items-center justify-between gap-[10px] px-[14px] py-[10px]">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-kv-fg">{membership.customer.name}</p>
                      <p className="truncate text-[12px] text-kv-muted-fg">{membership.plan.name}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={daysLeft <= 3 ? "text-[12px] font-medium text-amber-700" : "text-[12px] text-kv-secondary-fg"}>
                        {daysLeft === 1 ? "1 day left" : `${daysLeft} days left`}
                      </p>
                      <p className="text-[11px] text-kv-muted-fg">{membership.expiresAt ? formatDate(membership.expiresAt) : ""}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
