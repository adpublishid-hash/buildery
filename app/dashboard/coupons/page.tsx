import { BadgePercent, Boxes, Ticket, Users } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { CouponsTable } from "@/components/coupon/coupons-table";
import { CouponCheckoutToggle } from "@/components/coupon/coupon-checkout-toggle";

export const metadata = { title: "Coupons · My Landing" };

const PICKER_LIMIT = 500;

export default async function CouponsPage() {
  const { workspace } = await requireCurrentWorkspace();

  const [coupons, customers, products, courses, ecommerceSetting] =
    await Promise.all([
    prisma.coupon.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.customer.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
      take: PICKER_LIMIT,
    }),
    prisma.product.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, name: true, price: true },
      orderBy: { name: "asc" },
      take: PICKER_LIMIT,
    }),
    prisma.course.findMany({ where: { workspaceId: workspace.id }, select: { id: true, title: true, price: true }, orderBy: { title: "asc" } }),
    prisma.ecommerceSetting.findUnique({
      where: { workspaceId: workspace.id },
      select: { checkoutCouponEnabled: true },
    }),
  ]);
  // The pickers are capped, so a coupon may target a customer or product that
  // fell outside the first page. Load those too, so existing coupons still
  // show (and keep) the right target when edited.
  const knownCustomerIds = new Set(customers.map((item) => item.id));
  const knownProductIds = new Set(products.map((item) => item.id));
  const missingCustomerIds = Array.from(
    new Set(coupons.flatMap((coupon) => (coupon.customerId ? [coupon.customerId] : [])))
  ).filter((id) => !knownCustomerIds.has(id));
  const missingProductIds = Array.from(
    new Set(coupons.flatMap((coupon) => coupon.productIds))
  ).filter((id) => !knownProductIds.has(id));
  const [extraCustomers, extraProducts] = await Promise.all([
    missingCustomerIds.length
      ? prisma.customer.findMany({
          where: { workspaceId: workspace.id, id: { in: missingCustomerIds } },
          select: { id: true, name: true, email: true },
        })
      : [],
    missingProductIds.length
      ? prisma.product.findMany({
          where: { workspaceId: workspace.id, id: { in: missingProductIds } },
          select: { id: true, name: true, price: true },
        })
      : [],
  ]);
  const customerOptions = [...customers, ...extraCustomers];
  const productOptions = [...products, ...extraProducts];

  const activeCoupons = coupons.filter((coupon) => {
    const expired = coupon.expiresAt ? coupon.expiresAt.getTime() < Date.now() : false;
    const exhausted = coupon.maxUses != null && coupon.uses >= coupon.maxUses;
    return coupon.isActive && !expired && !exhausted;
  }).length;
  const targetedCustomers = coupons.filter((coupon) => coupon.customerId).length;
  const targetedProducts = coupons.filter((coupon) => coupon.productIds.length > 0).length;

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Coupons"
        description="Create promo codes customers can redeem at checkout."
      />

      <div className="mb-6">
        <CouponCheckoutToggle
          enabled={ecommerceSetting?.checkoutCouponEnabled !== false}
        />
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total coupons"
          value={coupons.length}
          delta="All saved codes"
          icon={Ticket}
        />
        <StatCard
          label="Active"
          value={activeCoupons}
          delta="Redeemable at checkout"
          icon={BadgePercent}
          trend="up"
        />
        <StatCard
          label="Customer targeted"
          value={targetedCustomers}
          delta="Restricted by buyer"
          icon={Users}
        />
        <StatCard
          label="Product targeted"
          value={targetedProducts}
          delta="Restricted by item"
          icon={Boxes}
        />
      </section>

      {coupons.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="No coupons yet"
          description="Create your first coupon — percentage or fixed-amount discount."
          className="mt-6"
          action={null}
        />
      ) : null}

      <Card className="mt-6">
        <CardContent className="pt-6">
          <CouponsTable coupons={coupons} customers={customerOptions} products={productOptions} courses={courses} />
        </CardContent>
      </Card>
    </div>
  );
}
