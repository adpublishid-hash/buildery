import { publicSiteContextHref } from "@/lib/public-url-server";
import { prisma } from "@/lib/prisma";
import type { SalesNotificationItem } from "@/lib/sales-notification-shared";

const PAID_ORDER_STATUSES = ["PAID", "PROCESSING", "COMPLETED"] as const;

export async function getSalesNotificationsForWorkspace(
  workspaceId: string,
  workspaceSlug: string
): Promise<SalesNotificationItem[]> {
  const [orders, enrollments, memberships] = await Promise.all([
    prisma.order.findMany({
      where: {
        workspaceId,
        status: { in: [...PAID_ORDER_STATUSES] },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        customer: { select: { name: true } },
        items: {
          take: 2,
          include: {
            product: {
              select: {
                slug: true,
                image: { select: { url: true } },
              },
            },
          },
        },
      },
    }),
    prisma.enrollment.findMany({
      where: {
        workspaceId,
        status: "ACTIVE",
        course: { status: "PUBLISHED" },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        customer: { select: { name: true } },
        course: {
          select: {
            title: true,
            slug: true,
            image: { select: { url: true } },
          },
        },
      },
    }),
    prisma.customerMembership.findMany({
      where: {
        workspaceId,
        status: "ACTIVE",
        plan: { isActive: true },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        customer: { select: { name: true } },
        plan: { select: { name: true } },
      },
    }),
  ]);

  const orderItems = orders.flatMap((order) =>
    order.items.map((item) => ({
      id: `order-${order.id}-${item.id}`,
      name: publicCustomerName(order.customer?.name),
      action: "membeli",
      item: item.nameSnapshot,
      type: "product" as const,
      typeLabel: "Produk",
      href: item.product?.slug
        ? publicSiteContextHref(workspaceSlug, `products/${item.product.slug}`)
        : publicSiteContextHref(workspaceSlug, "products"),
      imageUrl: item.product?.image?.url ?? null,
      createdAt: order.createdAt.toISOString(),
    }))
  );

  const courseItems = enrollments.map((enrollment) => ({
    id: `course-${enrollment.id}`,
    name: publicCustomerName(enrollment.customer.name),
    action: "mendaftar ke",
    item: enrollment.course.title,
    type: "course" as const,
    typeLabel: "Kursus",
    href: publicSiteContextHref(
      workspaceSlug,
      `courses/${enrollment.course.slug}`
    ),
    imageUrl: enrollment.course.image?.url ?? null,
    createdAt: enrollment.createdAt.toISOString(),
  }));

  const membershipItems = memberships.map((membership) => ({
    id: `membership-${membership.id}`,
    name: publicCustomerName(membership.customer.name),
    action: "bergabung di",
    item: membership.plan.name,
    type: "membership" as const,
    typeLabel: "Membership",
    href: publicSiteContextHref(workspaceSlug, "memberships"),
    imageUrl: null,
    createdAt: membership.createdAt.toISOString(),
  }));

  return [...orderItems, ...courseItems, ...membershipItems]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 12);
}

function publicCustomerName(value?: string | null) {
  const parts = value?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return "Seseorang";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1]?.[0] ?? ""}.`;
}
