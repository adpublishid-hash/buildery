import Link from "next/link";
import type {
  PaymentReconciliationResult,
  PaymentStatus,
  PaymentWebhookResult,
} from "@prisma/client";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  CreditCard,
  ExternalLink,
  ReceiptText,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { formatDate, formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Pagination, parsePage } from "@/components/ui/pagination";
import { StatCard } from "@/components/dashboard/stat-card";

export const metadata = { title: "Pembayaran · My Landing" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

const STATUS_VARIANT: Record<
  PaymentStatus,
  "default" | "secondary" | "success" | "outline"
> = {
  PENDING: "secondary",
  PAID: "success",
  FAILED: "outline",
  EXPIRED: "outline",
  CANCELLED: "outline",
};

const STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: "Menunggu",
  PAID: "Berhasil",
  FAILED: "Gagal",
  EXPIRED: "Kedaluwarsa",
  CANCELLED: "Dibatalkan",
};

const KIND_LABEL: Record<string, string> = {
  ORDER: "Order",
  ENROLLMENT: "Kursus",
  MEMBERSHIP: "Membership",
};

const WEBHOOK_RESULT_LABEL: Record<PaymentWebhookResult, string> = {
  INVALID_BODY: "Body invalid",
  BAD_SIGNATURE: "Signature salah",
  UNKNOWN_PAYMENT: "Payment tidak dikenal",
  PROCESSED: "Webhook OK",
  PROCESSING_FAILED: "Processing gagal",
};

const WEBHOOK_RESULT_VARIANT: Record<
  PaymentWebhookResult,
  "default" | "secondary" | "success" | "outline" | "destructive"
> = {
  INVALID_BODY: "destructive",
  BAD_SIGNATURE: "destructive",
  UNKNOWN_PAYMENT: "outline",
  PROCESSED: "success",
  PROCESSING_FAILED: "destructive",
};

const RECONCILIATION_RESULT_LABEL: Record<PaymentReconciliationResult, string> = {
  SYNCED: "Sync memperbaiki",
  UNCHANGED: "Sync sama",
  NOT_FOUND: "Tidak ditemukan",
  FAILED: "Sync gagal",
};

const RECONCILIATION_RESULT_VARIANT: Record<
  PaymentReconciliationResult,
  "default" | "secondary" | "success" | "outline" | "destructive"
> = {
  SYNCED: "success",
  UNCHANGED: "secondary",
  NOT_FOUND: "outline",
  FAILED: "destructive",
};

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const { workspace } = await requireCurrentWorkspace();
  const page = parsePage(searchParams.page);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    total,
    paidAgg,
    refundedAgg,
    monthAgg,
    monthRefundedAgg,
    statusAgg,
    payments,
    expiredPending,
    webhookFailures24h,
    reconciliationFailures24h,
    latestWebhook,
    latestReconciliation,
  ] = await Promise.all([
    prisma.payment.count({ where: { workspaceId: workspace.id } }),
    prisma.payment.aggregate({
      where: { workspaceId: workspace.id, status: "PAID" },
      _sum: { amount: true },
    }),
    prisma.orderRefund.aggregate({
      where: { workspaceId: workspace.id, status: "REFUNDED" },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: {
        workspaceId: workspace.id,
        status: "PAID",
        paidAt: { gte: monthStart },
      },
      _sum: { amount: true },
    }),
    prisma.orderRefund.aggregate({
      where: {
        workspaceId: workspace.id,
        status: "REFUNDED",
        OR: [
          { refundedAt: { gte: monthStart } },
          { refundedAt: null, createdAt: { gte: monthStart } },
        ],
      },
      _sum: { amount: true },
    }),
    prisma.payment.groupBy({
      by: ["status"],
      where: { workspaceId: workspace.id },
      _count: { _all: true },
    }),
    prisma.payment.findMany({
      where: { workspaceId: workspace.id },
      include: {
        order: { select: { id: true, orderNumber: true } },
        enrollment: {
          select: {
            course: { select: { title: true } },
            customer: { select: { name: true, email: true } },
          },
        },
        customerMembership: {
          select: {
            plan: { select: { name: true, level: true } },
            customer: { select: { name: true, email: true } },
          },
        },
        webhookEvents: {
          orderBy: { receivedAt: "desc" },
          take: 1,
          select: {
            result: true,
            mappedStatus: true,
            changedPayment: true,
            receivedAt: true,
            error: true,
          },
        },
        reconciliationEvents: {
          orderBy: { checkedAt: "desc" },
          take: 1,
          select: {
            result: true,
            mappedStatus: true,
            changedPayment: true,
            checkedAt: true,
            error: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.payment.count({
      where: {
        workspaceId: workspace.id,
        status: "PENDING",
        expiresAt: { lte: now },
      },
    }),
    prisma.paymentWebhookEvent.count({
      where: {
        workspaceId: workspace.id,
        result: { in: ["BAD_SIGNATURE", "PROCESSING_FAILED"] },
        receivedAt: { gte: last24h },
      },
    }),
    prisma.paymentReconciliationEvent.count({
      where: {
        workspaceId: workspace.id,
        result: "FAILED",
        checkedAt: { gte: last24h },
      },
    }),
    prisma.paymentWebhookEvent.findFirst({
      where: { workspaceId: workspace.id },
      orderBy: { receivedAt: "desc" },
      select: {
        result: true,
        mappedStatus: true,
        changedPayment: true,
        receivedAt: true,
        error: true,
      },
    }),
    prisma.paymentReconciliationEvent.findFirst({
      where: { workspaceId: workspace.id },
      orderBy: { checkedAt: "desc" },
      select: {
        result: true,
        mappedStatus: true,
        changedPayment: true,
        checkedAt: true,
        error: true,
      },
    }),
  ]);

  const grossPaidTotal = paidAgg._sum.amount ?? 0;
  const refundedTotal = refundedAgg._sum.amount ?? 0;
  const paidTotal = Math.max(0, grossPaidTotal - refundedTotal);
  const grossMonthTotal = monthAgg._sum.amount ?? 0;
  const monthRefundedTotal = monthRefundedAgg._sum.amount ?? 0;
  const monthTotal = Math.max(0, grossMonthTotal - monthRefundedTotal);
  const statusCount = new Map(statusAgg.map((row) => [row.status, row._count._all]));
  const pending = statusCount.get("PENDING") ?? 0;
  const failed =
    (statusCount.get("FAILED") ?? 0) +
    (statusCount.get("EXPIRED") ?? 0) +
    (statusCount.get("CANCELLED") ?? 0);

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Pembayaran"
        description="Pantau transaksi Midtrans, status checkout, dan revenue yang sudah terkumpul."
        action={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/payments/audit">
                <ShieldCheck className="h-4 w-4" />
                Audit
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/settings/integrations">
                <CreditCard className="h-4 w-4" />
                Atur Midtrans
              </Link>
            </Button>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Net terkumpul"
          value={formatPrice(paidTotal)}
          delta={`Gross ${formatPrice(grossPaidTotal)} · refund ${formatPrice(
            refundedTotal
          )}`}
          icon={Wallet}
          trend="up"
        />
        <StatCard
          label="Bulan ini"
          value={formatPrice(monthTotal)}
          delta={`Gross ${formatPrice(
            grossMonthTotal
          )} · refund ${formatPrice(monthRefundedTotal)}`}
          icon={CheckCircle2}
          trend="neutral"
        />
        <StatCard
          label="Menunggu"
          value={pending.toLocaleString("id-ID")}
          delta="Butuh penyelesaian customer"
          icon={Clock3}
          trend="neutral"
        />
        <StatCard
          label="Gagal / batal"
          value={failed.toLocaleString("id-ID")}
          delta="Failed, expired, cancelled"
          icon={AlertCircle}
          trend={failed > 0 ? "down" : "neutral"}
        />
      </section>

      {expiredPending > 0 ||
      webhookFailures24h > 0 ||
      reconciliationFailures24h > 0 ? (
        <section className="mt-6 rounded-lg border border-zinc-300 bg-zinc-100 px-4 py-3 text-sm text-zinc-800 dark:border-zinc-700/70 dark:bg-zinc-800/40 dark:text-zinc-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Pembayaran butuh perhatian</p>
              <p className="mt-1 text-xs leading-5">
                {expiredPending > 0
                  ? `${expiredPending.toLocaleString("id-ID")} payment pending sudah melewati batas waktu. Worker expiry akan menandainya otomatis. `
                  : ""}
                {webhookFailures24h > 0
                  ? `${webhookFailures24h.toLocaleString("id-ID")} webhook Midtrans gagal dalam 24 jam terakhir.`
                  : ""}
                {reconciliationFailures24h > 0
                  ? ` ${reconciliationFailures24h.toLocaleString("id-ID")} sync Midtrans gagal dalam 24 jam terakhir.`
                  : ""}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.45fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ringkasan status</CardTitle>
            <CardDescription>
              Distribusi transaksi di seluruh checkout.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(["PAID", "PENDING", "FAILED", "EXPIRED", "CANCELLED"] as PaymentStatus[]).map(
                (status) => {
                  const count = statusCount.get(status) ?? 0;
                  const percent = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={status} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-zinc-700 dark:text-zinc-200">
                          {STATUS_LABEL[status]}
                        </span>
                        <span className="text-zinc-500">
                          {count.toLocaleString("id-ID")} ({percent}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <div
                          className="h-2 rounded-full bg-zinc-900 dark:bg-zinc-100"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kesehatan payment sync</CardTitle>
            <CardDescription>
              Webhook dan reconciliation menjaga status Midtrans tetap sinkron.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {latestWebhook || latestReconciliation ? (
              <div className="space-y-3">
                {latestWebhook ? (
                  <PaymentHealthItem
                    label="Webhook terakhir"
                    badge={WEBHOOK_RESULT_LABEL[latestWebhook.result]}
                    variant={WEBHOOK_RESULT_VARIANT[latestWebhook.result]}
                    status={latestWebhook.mappedStatus}
                    changedPayment={latestWebhook.changedPayment}
                    at={latestWebhook.receivedAt}
                    error={latestWebhook.error}
                  />
                ) : null}
                {latestReconciliation ? (
                  <PaymentHealthItem
                    label="Sync terakhir"
                    badge={
                      RECONCILIATION_RESULT_LABEL[latestReconciliation.result]
                    }
                    variant={
                      RECONCILIATION_RESULT_VARIANT[
                        latestReconciliation.result
                      ]
                    }
                    status={latestReconciliation.mappedStatus}
                    changedPayment={latestReconciliation.changedPayment}
                    at={latestReconciliation.checkedAt}
                    error={latestReconciliation.error}
                  />
                ) : null}
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/settings/integrations">
                    Atur Midtrans
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <GuideStep
                  title="Hubungkan Midtrans"
                  description="Isi server key dan client key dari dashboard Midtrans."
                />
                <GuideStep
                  title="Tes checkout"
                  description="Buat produk percobaan lalu pastikan redirect Snap berjalan."
                />
                <GuideStep
                  title="Pantau settlement"
                  description="Transaksi paid masuk otomatis setelah notifikasi diterima."
                />
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="mt-6">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Riwayat transaksi</CardTitle>
            <CardDescription>
              Semua pembayaran dari order, kursus, dan membership.
            </CardDescription>
          </div>
          <Badge variant="secondary">{total.toLocaleString("id-ID")} transaksi</Badge>
        </CardHeader>
        <CardContent className="p-0">
          {total === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={ReceiptText}
                title="Belum ada pembayaran"
                description="Pembayaran akan muncul di sini setelah customer checkout melalui Midtrans."
              />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Referensi</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Item / customer</TableHead>
                    <TableHead>Nominal</TableHead>
                    <TableHead>Metode</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className="pr-4 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => {
                    const item = resolvePaymentItem(payment);
                    return (
                      <TableRow key={payment.id}>
                        <TableCell className="pl-4 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                          {payment.midtransOrderId}
                        </TableCell>
                        <TableCell className="text-sm text-zinc-500">
                          {KIND_LABEL[payment.kind] ?? payment.kind}
                        </TableCell>
                        <TableCell className="max-w-[18rem]">
                          <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                            {item.title}
                          </div>
                          <div className="truncate text-xs text-zinc-500">
                            {item.subtitle}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                          {formatPrice(payment.amount)}
                        </TableCell>
                        <TableCell className="text-xs text-zinc-500">
                          <div>{payment.paymentType ?? payment.provider}</div>
                          <PaymentWebhookMiniStatus
                            event={payment.webhookEvents[0] ?? null}
                            reconciliation={
                              payment.reconciliationEvents[0] ?? null
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[payment.status]}>
                            {STATUS_LABEL[payment.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-zinc-500">
                          {formatDate(payment.paidAt ?? payment.createdAt)}
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          {payment.order ? (
                            <Button asChild variant="ghost" size="sm">
                              <Link href={`/dashboard/orders/${payment.order.id}`}>
                                Detail
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          ) : (
                            <span className="text-xs text-zinc-400">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="border-t border-zinc-200/70 dark:border-zinc-800">
                <Pagination
                  page={page}
                  total={total}
                  pageSize={PAGE_SIZE}
                  basePath="/dashboard/payments"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GuideStep({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
        <CheckCircle2 className="h-4 w-4" />
      </div>
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        {title}
      </h3>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
    </div>
  );
}

function PaymentWebhookMiniStatus({
  event,
  reconciliation,
}: {
  event: {
    result: PaymentWebhookResult;
    mappedStatus: PaymentStatus | null;
    changedPayment: boolean | null;
    receivedAt: Date;
    error: string | null;
  } | null;
  reconciliation: {
    result: PaymentReconciliationResult;
    mappedStatus: PaymentStatus | null;
    changedPayment: boolean | null;
    checkedAt: Date;
    error: string | null;
  } | null;
}) {
  if (!event && !reconciliation) {
    return (
      <div className="mt-1 text-[11px] text-zinc-400">
        Belum ada webhook/sync
      </div>
    );
  }
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {event ? (
        <Badge
          variant={WEBHOOK_RESULT_VARIANT[event.result]}
          className="px-2 py-0"
        >
          {WEBHOOK_RESULT_LABEL[event.result]}
        </Badge>
      ) : null}
      {reconciliation ? (
        <Badge
          variant={RECONCILIATION_RESULT_VARIANT[reconciliation.result]}
          className="px-2 py-0"
        >
          {RECONCILIATION_RESULT_LABEL[reconciliation.result]}
        </Badge>
      ) : null}
      {event?.changedPayment === false ||
      reconciliation?.changedPayment === false ? (
        <span className="text-[11px] text-zinc-400">idempotent</span>
      ) : null}
    </div>
  );
}

function PaymentHealthItem({
  label,
  badge,
  variant,
  status,
  changedPayment,
  at,
  error,
}: {
  label: string;
  badge: string;
  variant: "default" | "secondary" | "success" | "outline" | "destructive";
  status: PaymentStatus | null;
  changedPayment: boolean | null;
  at: Date;
  error: string | null;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-zinc-500">{label}</span>
        <Badge variant={variant}>{badge}</Badge>
        {status ? <Badge variant="outline">{STATUS_LABEL[status]}</Badge> : null}
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {formatDate(at)}
        {changedPayment === false ? " · Tidak mengubah status" : ""}
      </p>
      {error ? (
        <p className="mt-2 line-clamp-2 text-xs text-zinc-800 dark:text-zinc-200">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function resolvePaymentItem(payment: {
  description: string | null;
  order: { orderNumber: string } | null;
  enrollment: {
    course: { title: string };
    customer: { name: string; email: string };
  } | null;
  customerMembership: {
    plan: { name: string; level: string };
    customer: { name: string; email: string };
  } | null;
}) {
  if (payment.order) {
    return {
      title: payment.description ?? payment.order.orderNumber,
      subtitle: payment.order.orderNumber,
    };
  }
  if (payment.enrollment) {
    return {
      title: payment.enrollment.course.title,
      subtitle:
        payment.enrollment.customer.name ?? payment.enrollment.customer.email,
    };
  }
  if (payment.customerMembership) {
    return {
      title:
        payment.customerMembership.plan.name ??
        `Membership ${payment.customerMembership.plan.level}`,
      subtitle:
        payment.customerMembership.customer.name ??
        payment.customerMembership.customer.email,
    };
  }
  return {
    title: payment.description ?? "Pembayaran",
    subtitle: "Transaksi manual",
  };
}
