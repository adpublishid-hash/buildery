import Link from "next/link";
import { CreditCard, Eye, LockKeyhole, Users } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { publicSiteHref } from "@/lib/public-url";
import { formatPrice } from "@/lib/utils";
import { MEMBERSHIP_LEVEL_LABEL } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { MembershipNav } from "@/components/membership/membership-nav";
import { PlansTable } from "@/components/membership/plans-table";

export const metadata = { title: "Membership plans · My Landing" };

export default async function MembershipPlansPage() {
  const { workspace } = await requireCurrentWorkspace();

  const [plans, products] = await Promise.all([
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
  ]);

  const activePlans = plans.filter((plan) => plan.isActive);
  const paidPlans = plans.filter((plan) => plan.price > 0);
  const memberCount = plans.reduce(
    (sum, plan) => sum + plan._count.memberships,
    0
  );
  const topPlan = plans
    .slice()
    .sort((a, b) => b._count.memberships - a._count.memberships)[0];

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Membership"
        description="Plans bundle access at a given level — Free, Basic, or Premium."
        action={
          <Button asChild variant="outline">
            <Link href={publicSiteHref(workspace.slug, "memberships")} target="_blank">
              <Eye className="h-4 w-4" />
              Public page
            </Link>
          </Button>
        }
      />
      <MembershipNav />

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <StatCard
          label="Plans"
          value={plans.length}
          delta={`${activePlans.length} active`}
          icon={CreditCard}
        />
        <StatCard
          label="Members"
          value={memberCount}
          delta="Across all plans"
          icon={Users}
        />
        <StatCard
          label="Paid plans"
          value={paidPlans.length}
          delta={
            paidPlans.length > 0
              ? `From ${formatPrice(Math.min(...paidPlans.map((p) => p.price)))}`
              : "No paid tier yet"
          }
          icon={LockKeyhole}
        />
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium text-zinc-500">Top plan</p>
            {topPlan ? (
              <>
                <p className="mt-1 truncate text-2xl font-semibold tracking-tight text-zinc-900">
                  {topPlan.name}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {MEMBERSHIP_LEVEL_LABEL[topPlan.level]}
                  </Badge>
                  <Badge variant="outline">
                    {topPlan._count.memberships} members
                  </Badge>
                </div>
              </>
            ) : (
              <p className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
                —
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {plans.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No plans yet"
          description="Create your first plan to start managing memberships."
        />
      ) : null}

      <Card>
        <CardContent className="pt-6">
          <PlansTable
            plans={plans.map((p) => ({ ...p, memberCount: p._count.memberships }))}
            products={products}
          />
        </CardContent>
      </Card>
    </div>
  );
}
