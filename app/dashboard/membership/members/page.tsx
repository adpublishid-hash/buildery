import Link from "next/link";
import { Clock3, CreditCard, UserCheck, Users } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { MEMBERSHIP_LEVEL_LABEL } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { MembershipNav } from "@/components/membership/membership-nav";
import { MembersTable, type MemberFilters } from "@/components/membership/members-table";
import { Pagination, parsePage } from "@/components/ui/pagination";
import type { MembershipStatus, Prisma } from "@prisma/client";

export const metadata = { title: "Members · My Landing" };

const PAGE_SIZE = 50;
const STATUS_VALUES: MembershipStatus[] = ["PENDING", "ACTIVE", "CANCELLED", "EXPIRED"];
const LEVEL_VALUES = ["FREE", "BASIC", "PREMIUM"] as const;
const DAY_MS = 1000 * 60 * 60 * 24;

export default async function MembershipMembersPage({
  searchParams,
}: {
  searchParams?: { q?: string; status?: string; level?: string; page?: string };
}) {
  const { workspace } = await requireCurrentWorkspace();
  const now = new Date();
  const nowTime = now.getTime();
  const page = parsePage(searchParams?.page);

  const filters: MemberFilters = {
    q: searchParams?.q?.trim() ?? "",
    status: STATUS_VALUES.includes(searchParams?.status as MembershipStatus)
      ? (searchParams?.status as MembershipStatus)
      : "ALL",
    level: LEVEL_VALUES.includes(searchParams?.level as (typeof LEVEL_VALUES)[number])
      ? (searchParams?.level as MemberFilters["level"])
      : "ALL",
  };

  const where: Prisma.CustomerMembershipWhereInput = {
    workspaceId: workspace.id,
    ...(filters.status !== "ALL" ? { status: filters.status } : {}),
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
  const active: Prisma.CustomerMembershipWhereInput = {
    workspaceId: workspace.id,
    status: "ACTIVE",
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };

  const [members, matchingCount, plans, totalCount, activeMembershipRows, expiringSoonCount] =
    await Promise.all([
      prisma.customerMembership.findMany({
        where,
        include: {
          customer: { select: { name: true, email: true } },
          plan: { select: { id: true, name: true, level: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.customerMembership.count({ where }),
      prisma.membershipPlan.findMany({
        where: { workspaceId: workspace.id, isActive: true },
        select: { id: true, name: true, level: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.customerMembership.count({ where: { workspaceId: workspace.id } }),
      prisma.customerMembership.findMany({
        where: active,
        select: { customerId: true, plan: { select: { level: true } } },
      }),
      // Same window as the old in-memory check: ceil(days left) between 0 and 14,
      // i.e. expiring later than one day ago and at most 14 days from now.
      prisma.customerMembership.count({
        where: {
          workspaceId: workspace.id,
          status: "ACTIVE",
          expiresAt: { gt: new Date(nowTime - DAY_MS), lte: new Date(nowTime + 14 * DAY_MS) },
        },
      }),
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

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Members"
        description="Customers assigned to a membership plan in this workspace."
        action={
          <Button asChild variant="outline">
            <Link href="/dashboard/membership/plans">
              Manage plans
            </Link>
          </Button>
        }
      />
      <MembershipNav />

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <StatCard
          label="Active members"
          value={activeCount}
          delta={`${totalCount} total records`}
          icon={UserCheck}
        />
        <StatCard
          label="Premium"
          value={activeCountByLevel.PREMIUM}
          delta="Highest access tier"
          icon={CreditCard}
        />
        <StatCard
          label="Expiring soon"
          value={expiringSoonCount}
          delta="Next 14 days"
          icon={Clock3}
        />
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium text-zinc-500">Active levels</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["FREE", "BASIC", "PREMIUM"] as const).map((level) => (
                <Badge key={level} variant="outline">
                  {MEMBERSHIP_LEVEL_LABEL[level]} ·{" "}
                  {activeCountByLevel[level]}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {totalCount === 0 ? (
        <EmptyState
          icon={Users}
          title="No members yet"
          description="Assign a customer to a plan to start gating premium content."
        />
      ) : null}

      <Card>
        <CardContent className="pt-6">
          <MembersTable
            members={members}
            plans={plans}
            now={nowTime}
            filters={filters}
            matchingCount={matchingCount}
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
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
