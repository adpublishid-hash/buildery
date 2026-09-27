import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  CreditCard,
  Flag,
  Package,
  ShieldCheck,
  ShoppingBag,
  Users,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import { formatDate, formatPrice } from "@/lib/utils";
import { getSuperAdminEmails } from "@/lib/super-admin";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";

export default async function AdminOverviewPage() {
  const allowedSuperAdmins = getSuperAdminEmails();
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [
    userCount,
    workspaceCount,
    productCount,
    courseCount,
    orderAgg,
    last30OrderAgg,
    pendingOrders,
    activeSubs,
    openReports,
    publicTemplates,
    planBreakdown,
    recentWorkspaces,
    recentOrders,
    superAdminUsers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.workspace.count(),
    prisma.product.count(),
    prisma.course.count(),
    prisma.order.aggregate({
      where: { status: { in: ["PAID", "PROCESSING", "COMPLETED"] } },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: {
        createdAt: { gte: since },
        status: { in: ["PAID", "PROCESSING", "COMPLETED"] },
      },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.saaSSubscription.count({ where: { status: "ACTIVE" } }),
    prisma.abuseReport.count({ where: { status: "OPEN" } }),
    prisma.siteTemplate.count({ where: { isPublished: true } }),
    prisma.saaSSubscription.groupBy({
      by: ["planId"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
    }),
    prisma.workspace.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { email: true } } },
    }),
    prisma.order.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: {
        workspace: { select: { name: true, slug: true } },
        customer: { select: { name: true, email: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: "SUPER_ADMIN" },
      select: { id: true, email: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const plans = await prisma.saaSPlan.findMany({
    orderBy: { sortOrder: "asc" },
  });
  const subsByPlan = new Map(
    planBreakdown.map((p) => [p.planId, p._count._all])
  );
  const unauthorizedSuperAdmins = superAdminUsers.filter(
    (user) => !allowedSuperAdmins.includes(user.email.toLowerCase())
  );

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Platform overview"
        description="Live command center untuk user, workspace, billing, order, dan moderation."
        action={
          <Button asChild variant="outline">
            <Link href="/dashboard">
              Back to dashboard <ArrowRight />
            </Link>
          </Button>
        }
      />

      <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-zinc-950 dark:text-white">
                Super admin allowlist: {allowedSuperAdmins.join(", ")}
              </p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Route guard dan session role hanya mengizinkan email yang ada
                di SUPER_ADMIN_EMAILS sebagai platform super admin.
              </p>
            </div>
          </div>
          <Badge
            variant={unauthorizedSuperAdmins.length > 0 ? "destructive" : "success"}
          >
            {unauthorizedSuperAdmins.length > 0
              ? `${unauthorizedSuperAdmins.length} extra role found`
              : "Access policy clean"}
          </Badge>
        </div>
        {unauthorizedSuperAdmins.length > 0 ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Ada user lain dengan role SUPER_ADMIN di database, tapi akses
                tetap diblokir oleh policy email. Ubah role mereka dari halaman
                Users.
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Users"
          value={userCount.toLocaleString("id-ID")}
          delta={`${activeSubs} active subscriptions`}
          trend="neutral"
          icon={Users}
        />
        <StatCard
          label="Workspaces"
          value={workspaceCount.toLocaleString("id-ID")}
          delta={`${productCount} products · ${courseCount} courses`}
          trend="neutral"
          icon={Boxes}
        />
        <StatCard
          label="Orders"
          value={(orderAgg._count._all ?? 0).toLocaleString("id-ID")}
          delta={`${pendingOrders} pending checkout`}
          trend="neutral"
          icon={ShoppingBag}
        />
        <StatCard
          label="GMV"
          value={formatPrice(orderAgg._sum.total ?? 0)}
          delta={`${formatPrice(last30OrderAgg._sum.total ?? 0)} last 30 days`}
          trend="up"
          icon={CreditCard}
        />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent orders</CardTitle>
            <CardDescription>
              Latest checkout activity across all workspaces.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {recentOrders.map((order) => (
                <li
                  key={order.id}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-950 dark:text-white">
                      {order.orderNumber} · {order.workspace.name}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {order.customer?.name ?? "Guest"} ·{" "}
                      {order.customer?.email ?? "no email"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-zinc-950 dark:text-white">
                      {formatPrice(order.total)}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {order.status.toLowerCase()}
                    </p>
                  </div>
                </li>
              ))}
              {recentOrders.length === 0 ? (
                <li className="py-6 text-center text-sm text-zinc-500">
                  No orders yet.
                </li>
              ) : null}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Operations</CardTitle>
            <CardDescription>Items that may need attention.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <AdminLink
              href="/admin/reports"
              icon={Flag}
              label="Open reports"
              value={openReports}
              urgent={openReports > 0}
            />
            <AdminLink
              href="/admin/templates"
              icon={Package}
              label="Published templates"
              value={publicTemplates}
            />
            <AdminLink
              href="/admin/subscriptions"
              icon={CreditCard}
              label="Active subscriptions"
              value={activeSubs}
            />
          </CardContent>
        </Card>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Subscriptions by plan</CardTitle>
            <CardDescription>Active subscriptions only.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {plans.map((plan) => {
                const count = subsByPlan.get(plan.id) ?? 0;
                const pct = activeSubs
                  ? Math.round((count / Math.max(activeSubs, 1)) * 100)
                  : 0;
                return (
                  <li key={plan.id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-700 dark:text-zinc-300">
                        {plan.name}
                      </span>
                      <span className="font-medium text-zinc-900 dark:text-white">
                        {count}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-zinc-950 dark:bg-zinc-50"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-zinc-400" /> Newest
              workspaces
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {recentWorkspaces.map((workspace) => (
                <li
                  key={workspace.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200/70 px-3 py-2 dark:border-zinc-800"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-zinc-900 dark:text-white">
                      {workspace.name}
                    </span>
                    <span className="block truncate text-xs text-zinc-400">
                      {workspace.createdBy.email}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-zinc-400">
                    {formatDate(workspace.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function AdminLink({
  href,
  icon: Icon,
  label,
  value,
  urgent,
}: {
  href: string;
  icon: typeof Flag;
  label: string;
  value: number;
  urgent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border border-zinc-200/70 px-3 py-3 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
    >
      <span className="flex items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
        <Icon className="h-4 w-4 text-zinc-400" />
        {label}
      </span>
      <Badge variant={urgent ? "destructive" : "secondary"}>{value}</Badge>
    </Link>
  );
}
