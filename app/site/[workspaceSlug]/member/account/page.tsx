import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowRight,
  BookOpen,
  CreditCard,
  GraduationCap,
  Heart,
  Handshake,
  ShoppingBag,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import { getStoreWorkspace } from "@/lib/store";
import { getMemberSession } from "@/lib/member-auth";
import { publicSiteContextHref } from "@/lib/public-url-server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StoreHeader } from "@/components/store/store-header";
import { MemberLogoutButton } from "@/components/member/member-logout-button";
import { MEMBERSHIP_LEVEL_LABEL } from "@/lib/labels";
import { formatPrice } from "@/lib/utils";
import { issuePublicAccessToken } from "@/lib/public-access-token";
import { normalizeDigitalAccessItems } from "@/lib/digital-access";
import {
  CancelMembershipButton,
  MemberAccountControls,
} from "@/components/member/member-account-controls";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Member account" },
};

export default async function MemberAccountPage({
  params,
}: {
  params: { workspaceSlug: string };
}) {
  const workspace = await getStoreWorkspace(params.workspaceSlug);
  if (!workspace) notFound();

  const session = await getMemberSession(workspace.slug);
  if (!session) {
    redirect(
      publicSiteContextHref(
        workspace.slug,
        "member/login?callbackUrl=" +
          encodeURIComponent(
            publicSiteContextHref(workspace.slug, "member/account")
          )
      )
    );
  }

  const customer = await prisma.customer.findUnique({
    where: { id: session.customerId },
    include: {
      memberships: {
        include: { plan: true, payments: { orderBy: { createdAt: "desc" } } },
        orderBy: { createdAt: "desc" },
      },
      affiliates: {
        where: { status: { not: "ARCHIVED" } },
        select: { id: true, status: true },
        take: 1,
      },
      enrollments: {
        include: {
          course: {
            select: {
              id: true,
              title: true,
              slug: true,
              image: { select: { url: true } },
              modules: { select: { _count: { select: { lessons: true } } } },
            },
          },
          lastLesson: { select: { id: true, title: true } },
          certificate: { select: { verificationCode: true, revokedAt: true } },
          _count: { select: { progress: { where: { completedAt: { not: null } } } } },
        },
        orderBy: { createdAt: "desc" },
      },
      orders: {
        include: {
          items: {
            // The product carries the access links; the snapshot on the item
            // only records what was bought.
            include: {
              product: {
                select: {
                  type: true,
                  downloadUrl: true,
                  downloadLabel: true,
                  digitalAccessItems: true,
                },
              },
            },
          },
          payment: true,
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      },
      wishlistItems: {
        include: { product: { include: { image: true } } },
        orderBy: { createdAt: "desc" },
        take: 30,
      },
      lessonBookmarks: {
        include: { lesson: { include: { module: { include: { course: { select: { id: true, title: true } } } } } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
  if (!customer || customer.workspaceId !== workspace.id) notFound();

  const activeMemberships = customer.memberships.filter(
    (membership) =>
      membership.status === "ACTIVE" &&
      (!membership.expiresAt || membership.expiresAt > new Date())
  );

  // Everything a paying customer can open right now. A digital product with
  // no access link configured is skipped rather than shown as a dead row.
  const digitalAccess = customer.orders
    .filter((order) => order.status === "PAID" || order.status === "COMPLETED")
    .flatMap((order) =>
      order.items
        .filter((item) => item.product?.type === "DIGITAL")
        .map((item) => ({
          key: item.id,
          name: item.nameSnapshot,
          orderNumber: order.orderNumber,
          links: normalizeDigitalAccessItems(item.product),
        }))
    )
    .filter((entry) => entry.links.length > 0);

  return (
    <div className="min-h-screen bg-zinc-50">
      <StoreHeader
        workspaceSlug={workspace.slug}
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        logoUrl={workspace.logoUrl}
      />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-zinc-500">Member area</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">
              {customer.name}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">{customer.email}</p>
          </div>
          <MemberLogoutButton workspaceSlug={workspace.slug} />
        </div>

        {customer.affiliates.length ? <div className="mt-5">
          <Button asChild variant="outline"><Link href={publicSiteContextHref(workspace.slug, "member/affiliate")}><Handshake /> Affiliate dashboard</Link></Button>
        </div> : null}

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <StatCard
            icon={CreditCard}
            label="Active memberships"
            value={activeMemberships.length}
          />
          <StatCard
            icon={GraduationCap}
            label="Course enrollments"
            value={customer.enrollments.length}
          />
          <StatCard
            icon={ShoppingBag}
            label="Orders"
            value={customer.orders.length}
          />
        </div>

        <MemberAccountControls
          workspaceSlug={workspace.slug}
          name={customer.name}
          phone={customer.phone}
        />

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Orders</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {customer.orders.length === 0 ? <EmptyState icon={ShoppingBag} title="No orders yet" href={publicSiteContextHref(workspace.slug, "products")} cta="Browse products" /> : customer.orders.map((order) => (
                <Link key={order.id} href={`${publicSiteContextHref(workspace.slug, "checkout/success")}?order=${encodeURIComponent(order.orderNumber)}&access=${encodeURIComponent(issuePublicAccessToken("order", order.id))}`} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-3 hover:border-zinc-300">
                  <div><p className="text-sm font-medium">{order.orderNumber}</p><p className="text-xs text-zinc-500">{order.items.length} item · {order.status.toLowerCase()}</p></div><span className="text-sm font-semibold">{formatPrice(order.total)}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Digital access</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {digitalAccess.length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">
                  Belum ada produk digital yang bisa diakses.
                </p>
              ) : (
                digitalAccess.map((entry) => (
                  <div
                    key={entry.key}
                    className="rounded-lg border border-zinc-200 bg-white p-3"
                  >
                    <p className="text-sm font-medium">{entry.name}</p>
                    <p className="text-xs text-zinc-500">{entry.orderNumber}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {entry.links.map((link) => (
                        <a
                          key={link.url}
                          href={link.url}
                          rel="noreferrer"
                          target="_blank"
                          className="inline-flex items-center rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                        >
                          {link.label}
                        </a>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Wishlist</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {customer.wishlistItems.length === 0 ? <EmptyState icon={Heart} title="Wishlist is empty" href={publicSiteContextHref(workspace.slug, "products")} cta="Browse products" /> : customer.wishlistItems.map(({ product }) => (
                <Link key={product.id} href={publicSiteContextHref(workspace.slug, `products/${product.slug}`)} className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 hover:border-zinc-300">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-zinc-100">{product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image.url} alt="" className="h-full w-full object-cover" />
                  ) : <Heart className="h-4 w-4 text-zinc-400" />}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{product.name}</p><p className="text-xs text-zinc-500">{formatPrice(product.discountPrice ?? product.price)}</p></div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Memberships</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {customer.memberships.length === 0 ? (
                <EmptyState
                  icon={CreditCard}
                  title="No memberships yet"
                  href={publicSiteContextHref(workspace.slug, "memberships")}
                  cta="View plans"
                />
              ) : (
                customer.memberships.map((membership) => (
                  <div
                    key={membership.id}
                    className="rounded-xl border border-zinc-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-zinc-900">
                          {membership.plan.name}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {MEMBERSHIP_LEVEL_LABEL[membership.plan.level]} access
                        </p>
                      </div>
                      <Badge
                        variant={
                          membership.status === "ACTIVE"
                            ? "success"
                            : "secondary"
                        }
                      >
                        {membership.status.toLowerCase()}
                      </Badge>
                    </div>
                    {membership.expiresAt ? (
                      <p className="mt-3 text-xs text-zinc-500">
                        Expires {membership.expiresAt.toLocaleDateString("id-ID")}
                      </p>
                    ) : null}
                    {membership.cancelAtPeriodEnd ? (
                      <p className="mt-2 text-xs font-medium text-amber-700">Cancellation scheduled at the end of access.</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={publicSiteContextHref(workspace.slug, "memberships")}>{membership.status === "ACTIVE" ? "Renew or upgrade" : "Buy access again"}</Link>
                      </Button>
                      {membership.status === "ACTIVE" && !membership.cancelAtPeriodEnd ? (
                        <CancelMembershipButton workspaceSlug={workspace.slug} membershipId={membership.id} timed={Boolean(membership.expiresAt)} />
                      ) : null}
                    </div>
                    {membership.payments.length ? (
                      <div className="mt-4 border-t border-zinc-100 pt-3">
                        <p className="text-xs font-medium text-zinc-700">Payment history</p>
                        <div className="mt-2 space-y-1.5">
                          {membership.payments.map((payment) => (
                            <div key={payment.id} className="flex items-center justify-between gap-3 text-xs text-zinc-500">
                              <span>{payment.midtransOrderId} · {payment.status.toLowerCase()}</span>
                              <span className="font-medium text-zinc-700">{formatPrice(payment.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Courses</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {customer.enrollments.length === 0 ? (
                <EmptyState
                  icon={BookOpen}
                  title="No courses yet"
                  href={publicSiteContextHref(workspace.slug, "courses")}
                  cta="Browse courses"
                />
              ) : (
                customer.enrollments.map((enrollment) => (
                  <div
                    key={enrollment.id}
                    className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100">
                      {enrollment.course.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={enrollment.course.image.url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <BookOpen className="h-5 w-5 text-zinc-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-zinc-900">
                        {enrollment.course.title}
                      </p>
                      <p className="text-xs text-zinc-500">{enrollment.status.toLowerCase()} · {enrollment.progressPercent}% complete</p>
                      {enrollment.lastLesson ? <p className="truncate text-[11px] text-zinc-400">Continue: {enrollment.lastLesson.title}</p> : null}
                    </div>
                    {enrollment.status === "ACTIVE" ? (
                      <Button asChild size="sm">
                        <Link href={`/learn/${enrollment.id}${enrollment.lastLesson ? `?lesson=${enrollment.lastLesson.id}` : ""}`}>
                          Learn <ArrowRight />
                        </Link>
                      </Button>
                    ) : null}
                    {enrollment.certificate && !enrollment.certificate.revokedAt ? <Button asChild size="sm" variant="outline"><Link href={`/certificates/${enrollment.certificate.verificationCode}`}>Certificate</Link></Button> : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {customer.lessonBookmarks.length ? <Card><CardHeader><CardTitle>Bookmarked lessons</CardTitle></CardHeader><CardContent className="space-y-2">{customer.lessonBookmarks.map((bookmark) => {
            const enrollment = customer.enrollments.find((item) => item.course.id === bookmark.lesson.module.course.id);
            if (!enrollment) return null;
            return <Link key={bookmark.id} href={`/learn/${enrollment.id}?lesson=${bookmark.lesson.id}`} className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"><span className="truncate">{bookmark.lesson.title}</span><span className="ml-3 shrink-0 text-xs text-zinc-500">{bookmark.lesson.module.course.title}</span></Link>;
          })}</CardContent></Card> : null}
        </div>
      </main>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <Icon className="mb-3 h-5 w-5 text-zinc-400" />
        <p className="text-2xl font-semibold text-zinc-950">{value}</p>
        <p className="mt-1 text-xs text-zinc-500">{label}</p>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  icon: Icon,
  title,
  href,
  cta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-center">
      <Icon className="mx-auto h-6 w-6 text-zinc-300" />
      <p className="mt-3 text-sm font-medium text-zinc-900">{title}</p>
      <Button asChild variant="outline" className="mt-4">
        <Link href={href}>{cta}</Link>
      </Button>
    </div>
  );
}
