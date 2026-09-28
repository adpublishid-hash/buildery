import Link from "next/link";
import { CreditCard, GraduationCap, Info, Package } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { ensureAffiliateProgram } from "@/lib/actions/affiliate";
import { getAffiliateNavCounts } from "@/lib/affiliate-overview";
import { MEMBERSHIP_LEVEL_LABEL } from "@/lib/labels";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel } from "@/components/dashboard/panel";
import { AffiliateNav } from "@/components/affiliate/affiliate-nav";
import { CommissionRatesTable } from "@/components/affiliate/commission-rates-table";

export const metadata = { title: "Commission rates · My Landing" };

const cap = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

export default async function AffiliateRatesPage() {
  const { workspace, role } = await requireCurrentWorkspace();
  const canManage = canInWorkspace(role, "affiliate.manage");

  const [program, products, courses, plans, customPartners, navCounts] = await Promise.all([
    ensureAffiliateProgram(workspace.id),
    prisma.product.findMany({
      where: { workspaceId: workspace.id, status: { not: "ARCHIVED" } },
      select: { id: true, name: true, price: true, type: true, status: true, affiliateCommissionPercent: true },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      take: 500,
    }),
    prisma.course.findMany({
      where: { workspaceId: workspace.id, status: { not: "ARCHIVED" } },
      select: { id: true, title: true, price: true, isFree: true, status: true, affiliateCommissionPercent: true },
      orderBy: [{ status: "asc" }, { title: "asc" }],
      take: 500,
    }),
    prisma.membershipPlan.findMany({
      where: { workspaceId: workspace.id, archivedAt: null },
      select: { id: true, name: true, price: true, level: true, isActive: true, accessDays: true, affiliateCommissionPercent: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.affiliate.count({
      where: { workspaceId: workspace.id, commissionPercent: { not: null }, status: { not: "ARCHIVED" } },
    }),
    getAffiliateNavCounts(workspace.id),
  ]);

  const customItems = [...products, ...courses, ...plans].filter((item) => item.affiliateCommissionPercent != null).length;

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Affiliate"
        description="Set a different commission for specific products, courses, or membership plans."
      />
      <AffiliateNav {...navCounts} />

      <div className="mb-[16px] flex flex-wrap items-start gap-[10px] rounded-[12px] border-[0.8px] border-kv-border bg-kv-card px-[14px] py-[10px] text-[12px] leading-[1.55] text-kv-secondary-fg">
        <Info className="mt-[2px] h-[14px] w-[14px] shrink-0 text-kv-muted-fg" />
        <p className="min-w-0 flex-1">
          Everything earns the program default of{" "}
          <span className="font-semibold text-kv-fg">{program.commissionPercent}%</span>
          {canManage ? (
            <>
              {" "}(<Link href="/dashboard/affiliate/program" className="underline underline-offset-2 hover:text-kv-fg">change</Link>)
            </>
          ) : null}{" "}
          unless you set a rate below. A partner&apos;s own custom rate beats both
          {customPartners ? ` (${customPartners} ${customPartners === 1 ? "partner has" : "partners have"} one)` : ""}.
          Orders with several products use each product&apos;s rate, weighted by its share of the order.
          {customItems ? ` ${customItems} ${customItems === 1 ? "item has" : "items have"} a custom rate.` : ""}
        </p>
      </div>

      <div className="flex flex-col gap-[16px]">
        <Panel title="Products" icon={Package}>
          <CommissionRatesTable
            target="PRODUCT"
            programPercent={program.commissionPercent}
            canManage={canManage}
            emptyText="No products yet."
            rows={products.map((product) => ({
              id: product.id,
              name: product.name,
              detail: `${cap(product.type)} · ${cap(product.status)}`,
              price: product.price,
              percent: product.affiliateCommissionPercent,
            }))}
          />
        </Panel>
        <Panel title="Courses" icon={GraduationCap}>
          <CommissionRatesTable
            target="COURSE"
            programPercent={program.commissionPercent}
            canManage={canManage}
            emptyText="No courses yet."
            rows={courses.map((course) => ({
              id: course.id,
              name: course.title,
              detail: `${course.isFree ? "Free" : "Paid"} · ${cap(course.status)}`,
              price: course.isFree ? 0 : course.price,
              percent: course.affiliateCommissionPercent,
            }))}
          />
        </Panel>
        <Panel title="Membership plans" icon={CreditCard}>
          <CommissionRatesTable
            target="PLAN"
            programPercent={program.commissionPercent}
            canManage={canManage}
            emptyText="No membership plans yet."
            rows={plans.map((plan) => ({
              id: plan.id,
              name: plan.name,
              detail: `${MEMBERSHIP_LEVEL_LABEL[plan.level]} · ${plan.accessDays ? `${plan.accessDays} days` : "Lifetime"} · ${plan.isActive ? "Live" : "Hidden"}${program.recurringCommissions ? " · pays on renewals" : ""}`,
              price: plan.price,
              percent: plan.affiliateCommissionPercent,
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}
