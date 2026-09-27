import Link from "next/link";
import {
  ArrowRight,
  CreditCard,
  GraduationCap,
  LockKeyhole,
  Settings2,
  Users,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { publicSiteHref } from "@/lib/public-url";
import { formatPrice } from "@/lib/utils";
import { MEMBERSHIP_LEVEL_LABEL } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { MembershipNav } from "@/components/membership/membership-nav";

export const metadata = { title: "Membership · My Landing" };

export default async function MembershipOverviewPage() {
  const { workspace } = await requireCurrentWorkspace();

  const [
    plans,
    activeMemberRows,
    allMemberRows,
    gatedCourses,
    paidMembershipRevenue,
    renewalCount,
    expiringSoon,
  ] = await Promise.all([
    prisma.membershipPlan.findMany({
      where: { workspaceId: workspace.id },
      include: { _count: { select: { memberships: true } } },
      orderBy: [{ isActive: "desc" }, { level: "asc" }, { createdAt: "asc" }],
    }),
    prisma.customerMembership.findMany({
      where: {
        workspaceId: workspace.id,
        status: "ACTIVE",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      distinct: ["customerId"],
      select: { customerId: true },
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
    }),
    prisma.membershipGrant.count({
      where: { workspaceId: workspace.id, source: "RENEWAL" },
    }),
    prisma.customerMembership.count({
      where: {
        workspaceId: workspace.id,
        status: "ACTIVE",
        expiresAt: { gt: new Date(), lte: new Date(Date.now() + 14 * 86_400_000) },
      },
    }),
  ]);

  const activePlans = plans.filter((plan) => plan.isActive);
  const activeMembers = activeMemberRows.length;
  const totalMembers = allMemberRows.length;
  const activeRate = totalMembers ? Math.round((activeMembers / totalMembers) * 100) : 0;
  const publicUrl = publicSiteHref(workspace.slug, "memberships");

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Membership"
        description="Sell tiered access, gate courses, and manage member accounts."
        action={
          <>
            <Button asChild variant="outline">
              <Link href="/dashboard/membership/settings">
                <Settings2 /> Halaman
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={publicUrl} target="_blank">
                Public page
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
      <MembershipNav />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard
          label="Active members"
          value={activeMembers}
          delta={`${activeRate}% of ${totalMembers} unique members`}
          icon={Users}
        />
        <StatCard
          label="Active plans"
          value={activePlans.length}
          delta={`${plans.length} total plans`}
          icon={CreditCard}
        />
        <StatCard
          label="Gated courses"
          value={gatedCourses}
          delta="Basic or Premium access"
          icon={LockKeyhole}
        />
        <StatCard
          label="Membership revenue"
          value={formatPrice(paidMembershipRevenue._sum.amount ?? 0)}
          delta="Paid membership payments"
          icon={GraduationCap}
        />
        <StatCard
          label="Renewals"
          value={renewalCount}
          delta="Completed access extensions"
          icon={ArrowRight}
        />
        <StatCard
          label="Expiring soon"
          value={expiringSoon}
          delta="Within the next 14 days"
          icon={Users}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Plans</CardTitle>
          </CardHeader>
          <CardContent>
            {plans.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-200 p-8 text-center">
                <CreditCard className="mx-auto h-8 w-8 text-zinc-300" />
                <p className="mt-3 text-sm font-medium text-zinc-900">
                  No membership plans yet
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  Create Free, Basic, or Premium plans to unlock member-only
                  experiences.
                </p>
                <Button asChild className="mt-5">
                  <Link href="/dashboard/membership/plans">Create plan</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {plans.slice(0, 5).map((plan) => (
                  <div
                    key={plan.id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-zinc-900">{plan.name}</p>
                        <Badge variant={plan.isActive ? "success" : "outline"}>
                          {plan.isActive ? "Active" : "Inactive"}
                        </Badge>
                        <Badge variant="secondary">
                          {MEMBERSHIP_LEVEL_LABEL[plan.level]}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-sm text-zinc-500">
                        {plan.description || "Membership access tier"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium text-zinc-900">
                        {plan.price === 0 ? "Free" : formatPrice(plan.price)}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {plan._count.memberships} members
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Setup flow</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <FlowStep
              done={plans.length > 0}
              title="Create plans"
              description="Define Free, Basic, or Premium tiers."
            />
            <FlowStep
              done={activePlans.length > 0}
              title="Publish access"
              description="Make at least one plan active."
            />
            <FlowStep
              done={gatedCourses > 0}
              title="Gate content"
              description="Set course access to Basic or Premium."
            />
            <FlowStep
              done={activeMembers > 0}
              title="Invite members"
              description="Members can sign up, buy plans, and log in."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FlowStep({
  done,
  title,
  description,
}: {
  done: boolean;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-zinc-200 p-3">
      <span
        className={
          done
            ? "mt-0.5 h-4 w-4 rounded-full bg-zinc-900"
            : "mt-0.5 h-4 w-4 rounded-full border border-zinc-300"
        }
      />
      <div>
        <p className="text-sm font-medium text-zinc-900">{title}</p>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
      </div>
    </div>
  );
}
