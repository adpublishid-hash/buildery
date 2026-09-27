import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";
import { formatPrice } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { SubscriptionStatusControl } from "@/components/admin/subscription-status-control";
import { formatDate } from "@/lib/utils";
import { CreditCard } from "lucide-react";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import type { Prisma, SaaSSubscriptionStatus } from "@prisma/client";

export const metadata = { title: "Subscriptions · Admin" };

const PAGE_SIZE = 50;

export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams?: { page?: string; q?: string; status?: string };
}) {
  await requireSuperAdmin();
  const page = parsePage(searchParams?.page);
  const q = searchParams?.q?.trim() ?? "";
  const status = (["ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"] as SaaSSubscriptionStatus[]).includes(searchParams?.status as SaaSSubscriptionStatus) ? searchParams?.status as SaaSSubscriptionStatus : undefined;
  const where: Prisma.SaaSSubscriptionWhereInput = { ...(status ? { status } : {}), ...(q ? { OR: [{ user: { email: { contains: q, mode: "insensitive" } } }, { user: { name: { contains: q, mode: "insensitive" } } }, { plan: { name: { contains: q, mode: "insensitive" } } }] } : {}) };

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [subscriptions, totalCount, activeByPlan, collected] = await Promise.all([
    prisma.saaSSubscription.findMany({
      where,
      include: {
        user: { select: { name: true, email: true } },
        plan: { select: { name: true, monthlyPrice: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.saaSSubscription.count({ where }),
    prisma.saaSSubscription.groupBy({
      by: ["planId"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
    }),
    // Uang yang benar-benar masuk bulan ini, bukan proyeksi dari jumlah baris.
    prisma.saaSInvoice.aggregate({
      where: { status: "PAID", paidAt: { gte: monthStart } },
      _sum: { totalAmount: true },
    }),
  ]);
  const activePlans = await prisma.saaSPlan.findMany({
    where: { id: { in: activeByPlan.map((row) => row.planId) } },
    select: { id: true, monthlyPrice: true },
  });
  const priceByPlan = new Map(activePlans.map((plan) => [plan.id, plan.monthlyPrice]));

  // Monthly recurring revenue from active paid subscriptions.
  const mrr = activeByPlan.reduce(
    (sum, row) => sum + (priceByPlan.get(row.planId) ?? 0) * row._count._all,
    0
  );
  const activeCount = activeByPlan.reduce((sum, row) => sum + row._count._all, 0);

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Subscriptions"
        description="Langganan SaaS. Pembayaran diverifikasi di halaman Invoices; perubahan status di sini adalah penyesuaian manual."
      />

      <AdminFilterBar action="/admin/subscriptions" query={q} status={status} options={[{ value: "ACTIVE", label: "Aktif" }, { value: "PAST_DUE", label: "Past due" }, { value: "CANCELLED", label: "Dibatalkan" }, { value: "EXPIRED", label: "Kedaluwarsa" }]} />

      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="MRR"
          value={formatPrice(mrr)}
          delta="Proyeksi dari langganan aktif"
          trend="up"
          icon={CreditCard}
        />
        <StatCard
          label="Diterima bulan ini"
          value={formatPrice(collected._sum.totalAmount ?? 0)}
          delta="Pembayaran terverifikasi"
          trend="up"
          icon={CreditCard}
        />
        <StatCard
          label="Active"
          value={String(activeCount)}
          delta="Active subscriptions"
          trend="neutral"
          icon={CreditCard}
        />
        <StatCard
          label="Total"
          value={String(totalCount)}
          delta="All-time subscriptions"
          trend="neutral"
          icon={CreditCard}
        />
      </section>

      {totalCount === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No subscriptions yet"
          description="Subscriptions appear here once users pick a paid plan."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Account</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Renews</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="pl-4">
                      <p className="text-sm font-medium text-zinc-900">
                        {s.user.name ?? s.user.email}
                      </p>
                      <p className="truncate text-xs text-zinc-500">
                        {s.user.email}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm text-zinc-700">
                      {s.plan.name}
                    </TableCell>
                    <TableCell className="text-sm text-zinc-500">
                      {s.plan.monthlyPrice === 0
                        ? "Free"
                        : `${formatPrice(s.plan.monthlyPrice)}/mo`}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {formatDate(s.startedAt)}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {s.currentPeriodEnd
                        ? formatDate(s.currentPeriodEnd)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <SubscriptionStatusControl
                        subscriptionId={s.id}
                        status={s.status}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              page={page}
              total={totalCount}
              pageSize={PAGE_SIZE}
              basePath="/admin/subscriptions"
              params={{ q: q || undefined, status }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
