import Link from "next/link";
import { Clock3, Crown, UserCheck, Users } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { publicSiteHref } from "@/lib/public-url";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel } from "@/components/dashboard/panel";
import { StatCard } from "@/components/dashboard/stat-card";
import { CopyLinkButton } from "@/components/dashboard/copy-link-button";
import { MembershipNav } from "@/components/membership/membership-nav";
import {
  MembersTable,
  type MemberFilters,
  type MemberStatusFilter,
} from "@/components/membership/members-table";
import { Pagination, parsePage } from "@/components/ui/pagination";
import type { MembershipStatus, Prisma } from "@prisma/client";

export const metadata = { title: "Members · My Landing" };

const PAGE_SIZE = 50;
const STATUS_VALUES: MemberStatusFilter[] = ["PENDING", "ACTIVE", "CANCELLED", "EXPIRED", "EXPIRING"];
const LEVEL_VALUES = ["FREE", "BASIC", "PREMIUM"] as const;
const DAY_MS = 1000 * 60 * 60 * 24;
const EXPIRING_DAYS = 14;

export default async function MembershipMembersPage({
  searchParams,
}: {
  searchParams?: { q?: string; status?: string; level?: string; plan?: string; page?: string; assign?: string };
}) {
  const { workspace } = await requireCurrentWorkspace();
  const now = new Date();
  const nowTime = now.getTime();
  const page = parsePage(searchParams?.page);

  const filters: MemberFilters = {
    q: searchParams?.q?.trim().slice(0, 100) ?? "",
    status: STATUS_VALUES.includes(searchParams?.status as MemberStatusFilter)
      ? (searchParams?.status as MemberStatusFilter)
      : "ALL",
    level: LEVEL_VALUES.includes(searchParams?.level as (typeof LEVEL_VALUES)[number])
      ? (searchParams?.level as MemberFilters["level"])
      : "ALL",
    planId: searchParams?.plan?.slice(0, 40) ?? "",
  };

  const active: Prisma.CustomerMembershipWhereInput = {
    workspaceId: workspace.id,
    status: "ACTIVE",
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
  const expiring: Prisma.CustomerMembershipWhereInput = {
    workspaceId: workspace.id,
    status: "ACTIVE",
    expiresAt: { gt: now, lte: new Date(nowTime + EXPIRING_DAYS * DAY_MS) },
  };

  const statusWhere: Prisma.CustomerMembershipWhereInput =
    filters.status === "EXPIRING"
      ? { status: "ACTIVE", expiresAt: { gt: now, lte: new Date(nowTime + EXPIRING_DAYS * DAY_MS) } }
      : filters.status !== "ALL"
        ? { status: filters.status }
        : {};

  const where: Prisma.CustomerMembershipWhereInput = {
    workspaceId: workspace.id,
    ...statusWhere,
    ...(filters.planId ? { planId: filters.planId } : {}),
    ...(filters.level !== "ALL" ? { plan: { level: filters.level } } : {}),
    ...(filters.q
      ? {
          OR: [
            { customer: { name: { contains: filters.q, mode: "insensitive" } } },
            { customer: { email: { contains: filters.q, mode: "insensitive" } } },
            { plan: { name: { contains: filters.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [members, matchingCount, plans, statusRows, activeMembershipRows, expiringSoonCount] =
    await Promise.all([
      prisma.customerMembership.findMany({
        where,
        include: {
          customer: { select: { name: true, email: true } },
          plan: { select: { id: true, name: true, level: true } },
        },
        // Soonest-ending first when reviewing renewals; newest first otherwise.
        orderBy: filters.status === "EXPIRING" ? { expiresAt: "asc" } : { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.customerMembership.count({ where }),
      prisma.membershipPlan.findMany({
        where: { workspaceId: workspace.id },
        select: { id: true, name: true, level: true, isActive: true, archivedAt: true },
        orderBy: [{ archivedAt: "asc" }, { isActive: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      prisma.customerMembership.groupBy({
        by: ["status"],
        where: { workspaceId: workspace.id },
        _count: { _all: true },
      }),
      prisma.customerMembership.findMany({
        where: active,
        select: { customerId: true, plan: { select: { level: true } } },
      }),
      prisma.customerMembership.count({ where: expiring }),
    ]);

  const rank = { FREE: 0, BASIC: 1, PREMIUM: 2 } as const;
  const highestByCustomer = new Map<string, (typeof LEVEL_VALUES)[number]>();
  for (const row of activeMembershipRows) {
    const current = highestByCustomer.get(row.customerId);
    if (!current || rank[row.plan.level] > rank[current]) highestByCustomer.set(row.customerId, row.plan.level);
  }
  const activeCountByLevel = { FREE: 0, BASIC: 0, PREMIUM: 0 };
  for (const level of highestByCustomer.values()) activeCountByLevel[level] += 1;
  const activeCount = highestByCustomer.size;

  const counts: Partial<Record<MemberStatusFilter, number>> = { EXPIRING: expiringSoonCount };
  let totalCount = 0;
  for (const row of statusRows) {
    counts[row.status as MembershipStatus] = row._count._all;
    totalCount += row._count._all;
  }
  const publicUrl = publicSiteHref(workspace.slug, "memberships");

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Members"
        description="Customers with a membership plan in this workspace."
        action={
          <>
            <CopyLinkButton href={publicUrl} label="Copy signup link" toastMessage="Membership page link copied" />
            <Button asChild variant="outline">
              <Link href="/dashboard/membership/plans">Manage plans</Link>
            </Button>
          </>
        }
      />
      <MembershipNav expiringSoon={expiringSoonCount} />

      <div className="mb-[16px] grid grid-cols-1 gap-[12px] sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          index={0}
          label="Active members"
          value={activeCount.toLocaleString()}
          delta={`${activeCountByLevel.FREE} on a free tier`}
          icon={UserCheck}
        />
        <StatCard
          index={1}
          label="Premium"
          value={activeCountByLevel.PREMIUM.toLocaleString()}
          delta="Highest access tier"
          icon={Crown}
        />
        <StatCard
          index={2}
          label="Basic"
          value={activeCountByLevel.BASIC.toLocaleString()}
          delta="Paid entry tier"
          icon={Users}
        />
        <StatCard
          index={3}
          label="Expiring soon"
          value={expiringSoonCount.toLocaleString()}
          delta={`Next ${EXPIRING_DAYS} days`}
          icon={Clock3}
        />
      </div>

      {totalCount === 0 && !plans.some((plan) => !plan.archivedAt) ? (
        <EmptyState
          icon={Users}
          title="No members yet"
          description="Create a plan first. Members join from your membership page, buy a linked product, or get assigned here."
          action={
            <Button asChild>
              <Link href="/dashboard/membership/plans">Create a plan</Link>
            </Button>
          }
        />
      ) : (
        <Panel title="Members" icon={Users}>
          <MembersTable
            members={members}
            plans={plans}
            now={nowTime}
            filters={filters}
            counts={counts}
            matchingCount={matchingCount}
            assignOpenByDefault={searchParams?.assign === "1"}
          />
          <Pagination
            page={page}
            total={matchingCount}
            pageSize={PAGE_SIZE}
            basePath="/dashboard/membership/members"
            params={{
              q: filters.q || undefined,
              status: filters.status !== "ALL" ? filters.status : undefined,
              level: filters.level !== "ALL" ? filters.level : undefined,
              plan: filters.planId || undefined,
            }}
          />
        </Panel>
      )}
    </div>
  );
}
