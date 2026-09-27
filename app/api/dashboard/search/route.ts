import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";
import { getCurrentWorkspace } from "@/lib/workspace";

type SearchIcon =
  | "BookOpen"
  | "ClipboardList"
  | "FileText"
  | "Newspaper"
  | "Package"
  | "ShoppingBag"
  | "Users";

type SearchResult = {
  label: string;
  href: string;
  group: string;
  description?: string;
  icon: SearchIcon;
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ results: [] }, { status: 401 });
  }

  const current = await getCurrentWorkspace(session.user.id);
  if (!current) return NextResponse.json({ results: [] });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ results: [] });

  const workspaceId = current.workspace.id;
  const canEditContent = canInWorkspace(current.role, "content.edit");
  const contains = { contains: q, mode: "insensitive" as const };

  const [orders, customers, products, pages, courses, forms, posts] =
    await Promise.all([
      prisma.order.findMany({
        where: {
          workspaceId,
          OR: [
            { orderNumber: contains },
            { customer: { name: contains } },
            { customer: { email: contains } },
          ],
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          customer: { select: { name: true, email: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
      prisma.customer.findMany({
        where: {
          workspaceId,
          OR: [{ name: contains }, { email: contains }, { phone: contains }],
        },
        select: { name: true, email: true, phone: true },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
      prisma.product.findMany({
        where: {
          workspaceId,
          OR: [{ name: contains }, { slug: contains }, { sku: contains }],
        },
        select: { id: true, name: true, status: true, price: true, slug: true },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
      prisma.page.findMany({
        where: {
          website: { workspaceId },
          OR: [{ title: contains }, { slug: contains }],
        },
        select: { id: true, title: true, slug: true, status: true },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
      prisma.course.findMany({
        where: {
          workspaceId,
          OR: [{ title: contains }, { slug: contains }, { summary: contains }],
        },
        select: { id: true, title: true, slug: true, status: true },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
      prisma.form.findMany({
        where: {
          workspaceId,
          OR: [{ title: contains }, { slug: contains }, { description: contains }],
        },
        select: { id: true, title: true, slug: true, status: true },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
      prisma.blogPost.findMany({
        where: {
          workspaceId,
          OR: [{ title: contains }, { slug: contains }, { excerpt: contains }],
        },
        select: { id: true, title: true, slug: true, status: true },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
    ]);

  const results: SearchResult[] = [
    ...orders.map((order) => ({
      label: order.orderNumber,
      href: `/dashboard/orders/${order.id}`,
      group: "Order",
      description: `${order.status.toLowerCase()} · ${
        order.customer?.name ?? order.customer?.email ?? "Guest"
      } · ${formatPrice(order.total)}`,
      icon: "ShoppingBag" as const,
    })),
    ...customers.map((customer) => ({
      label: customer.name || customer.email,
      href: "/dashboard/customers",
      group: "Customer",
      description: [customer.email, customer.phone].filter(Boolean).join(" · "),
      icon: "Users" as const,
    })),
    ...products.map((product) => ({
      label: product.name,
      href: canEditContent
        ? `/dashboard/products/${product.id}/edit`
        : "/dashboard/products",
      group: "Produk",
      description: `${product.status.toLowerCase()} · /${product.slug} · ${formatPrice(
        product.price
      )}`,
      icon: "Package" as const,
    })),
    ...pages.map((page) => ({
      label: page.title,
      href: canEditContent
        ? `/dashboard/pages/${page.id}/builder`
        : "/dashboard/pages",
      group: "Halaman",
      description: `${page.status.toLowerCase()} · /${page.slug}`,
      icon: "FileText" as const,
    })),
    ...courses.map((course) => ({
      label: course.title,
      href: canEditContent
        ? `/dashboard/courses/${course.id}/edit`
        : "/dashboard/courses",
      group: "Kursus",
      description: `${course.status.toLowerCase()} · /${course.slug}`,
      icon: "BookOpen" as const,
    })),
    ...forms.map((form) => ({
      label: form.title,
      href: `/dashboard/forms/${form.id}/submissions`,
      group: "Form",
      description: `${form.status.toLowerCase()} · /${form.slug}`,
      icon: "ClipboardList" as const,
    })),
    ...posts.map((post) => ({
      label: post.title,
      href: canEditContent
        ? `/dashboard/blog/${post.id}/edit`
        : "/dashboard/blog",
      group: "Blog",
      description: `${post.status.toLowerCase()} · /${post.slug}`,
      icon: "Newspaper" as const,
    })),
  ].slice(0, 18);

  return NextResponse.json({ results });
}
