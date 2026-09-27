import Link from "next/link";
import type { ReactNode } from "react";
import type {
  PaymentReconciliationResult,
  PaymentWebhookResult,
} from "@prisma/client";
import {
  AlertCircle,
  Clock3,
  ExternalLink,
  Hourglass,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Timer,
  XCircle,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { PaymentAuditAction } from "@/components/payments/payment-audit-actions";

export const metadata = { title: "Payment Audit · My Landing" };
export const dynamic = "force-dynamic";

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

const RECONCILIATION_RESULT_VARIANT: Record<
  PaymentReconciliationResult,
  "default" | "secondary" | "success" | "outline" | "destructive"
> = {
  SYNCED: "success",
  UNCHANGED: "secondary",
  NOT_FOUND: "outline",
  FAILED: "destructive",
};

export default async function PaymentAuditPage() {
  const { workspace } = await requireCurrentWorkspace();
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    pendingRefunds,
    providerRefundFailures,
    providerCancelFailures,
    expiredPendingPayments,
    webhookFailures,
    reconciliationFailures,
  ] = await Promise.all([
    prisma.orderRefund.findMany({
      where: {
        workspaceId: workspace.id,
        status: { in: ["REQUESTED", "APPROVED"] },
      },
      include: {
        order: { select: { id: true, orderNumber: true } },
        customer: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.orderRefund.findMany({
      where: {
        workspaceId: workspace.id,
        provider: "midtrans",
        status: { not: "REFUNDED" },
        OR: [
          { providerStatus: { startsWith: "HTTP_" } },
          { providerStatus: { in: ["FAILED", "REJECTED"] } },
        ],
      },
      include: {
        order: { select: { id: true, orderNumber: true } },
        customer: { select: { name: true, email: true } },
      },
      orderBy: [{ providerRequestedAt: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
    prisma.payment.findMany({
      where: {
        workspaceId: workspace.id,
        status: { not: "CANCELLED" },
        providerCancelStatus: { not: null },
        OR: [
          { providerCancelStatus: { startsWith: "HTTP_" } },
          { providerCancelStatus: { in: ["FAILED", "REJECTED"] } },
        ],
      },
      select: {
        id: true,
        amount: true,
        midtransOrderId: true,
        providerCancelStatus: true,
        providerCancelRequestedAt: true,
        order: { select: { id: true, orderNumber: true } },
      },
      orderBy: [{ providerCancelRequestedAt: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
    prisma.payment.findMany({
      where: {
        workspaceId: workspace.id,
        status: "PENDING",
        expiresAt: { lte: now },
      },
      select: {
        id: true,
        amount: true,
        midtransOrderId: true,
        expiresAt: true,
        order: { select: { id: true, orderNumber: true } },
      },
      orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
      take: 50,
    }),
    prisma.paymentWebhookEvent.findMany({
      where: {
        workspaceId: workspace.id,
        result: { in: ["INVALID_BODY", "BAD_SIGNATURE", "PROCESSING_FAILED"] },
        receivedAt: { gte: last24h },
      },
      select: {
        id: true,
        result: true,
        midtransOrderId: true,
        error: true,
        receivedAt: true,
        payment: {
          select: {
            order: { select: { id: true, orderNumber: true } },
          },
        },
      },
      orderBy: { receivedAt: "desc" },
      take: 50,
    }),
    prisma.paymentReconciliationEvent.findMany({
      where: {
        workspaceId: workspace.id,
        result: { in: ["FAILED", "NOT_FOUND"] },
        checkedAt: { gte: last24h },
      },
      select: {
        id: true,
        result: true,
        midtransOrderId: true,
        error: true,
        checkedAt: true,
        payment: {
          select: {
            order: { select: { id: true, orderNumber: true } },
          },
        },
      },
      orderBy: { checkedAt: "desc" },
      take: 50,
    }),
  ]);

  const riskCount =
    providerRefundFailures.length +
    providerCancelFailures.length +
    expiredPendingPayments.length +
    webhookFailures.length +
    reconciliationFailures.length;

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Payment Audit"
        description="Antrian pemeriksaan untuk refund, cancellation, expiry, webhook, dan reconciliation Midtrans."
        action={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/system/jobs">
                <Timer className="h-4 w-4" />
                Job runner
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/payments">
                <ExternalLink className="h-4 w-4" />
                Transaksi
              </Link>
            </Button>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Refund pending"
          value={pendingRefunds.length.toLocaleString("id-ID")}
          delta="Requested / approved"
          icon={RotateCcw}
          trend={pendingRefunds.length > 0 ? "neutral" : "up"}
        />
        <StatCard
          label="Provider gagal"
          value={(providerRefundFailures.length + providerCancelFailures.length).toLocaleString("id-ID")}
          delta="Refund atau cancel Midtrans"
          icon={AlertCircle}
          trend={providerRefundFailures.length + providerCancelFailures.length > 0 ? "down" : "up"}
        />
        <StatCard
          label="Pending lewat expiry"
          value={expiredPendingPayments.length.toLocaleString("id-ID")}
          delta="Menunggu worker expiry"
          icon={Clock3}
          trend={expiredPendingPayments.length > 0 ? "down" : "up"}
        />
        <StatCard
          label="Risk 24 jam"
          value={riskCount.toLocaleString("id-ID")}
          delta={`${webhookFailures.length} webhook · ${reconciliationFailures.length} sync`}
          icon={ShieldCheck}
          trend={riskCount > 0 ? "down" : "up"}
        />
      </section>

      <AuditSection
        title="Refund menunggu keputusan"
        description="Request dari customer atau admin yang belum selesai."
        empty="Tidak ada refund pending."
        count={pendingRefunds.length}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Nominal</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Dibuat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingRefunds.map((refund) => (
              <TableRow key={refund.id}>
                <TableCell className="pl-4">
                  <OrderLink order={refund.order} />
                </TableCell>
                <TableCell className="text-sm text-zinc-500">
                  {refund.customer?.name ?? refund.customer?.email ?? "Guest"}
                </TableCell>
                <TableCell className="font-medium">
                  {formatPrice(refund.amount)}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{refund.status.toLowerCase()}</Badge>
                </TableCell>
                <TableCell className="text-xs text-zinc-500">
                  {formatAuditDate(refund.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AuditSection>

      <AuditSection
        title="Refund provider gagal"
        description="Percobaan refund Midtrans yang ditolak atau error HTTP."
        empty="Tidak ada refund provider gagal."
        count={providerRefundFailures.length}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Nominal</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Terakhir dicoba</TableHead>
              <TableHead className="pr-4 text-right">Tindakan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providerRefundFailures.map((refund) => (
              <TableRow key={refund.id}>
                <TableCell className="pl-4">
                  <OrderLink order={refund.order} />
                </TableCell>
                <TableCell className="text-sm text-zinc-500">
                  {refund.customer?.name ?? refund.customer?.email ?? "Guest"}
                </TableCell>
                <TableCell className="font-medium">
                  {formatPrice(refund.amount)}
                </TableCell>
                <TableCell>
                  <Badge variant="destructive">
                    {refund.providerStatus ?? "failed"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-zinc-500">
                  {formatAuditDate(refund.providerRequestedAt ?? refund.createdAt)}
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <PaymentAuditAction
                    action="retry-refund"
                    targetId={refund.id}
                    icon={RotateCcw}
                    label="Retry refund"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AuditSection>

      <AuditSection
        title="Cancel provider gagal"
        description="Payment yang punya attempt cancel Midtrans, tetapi status internal belum cancelled."
        empty="Tidak ada cancel provider gagal."
        count={providerCancelFailures.length}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Order</TableHead>
              <TableHead>Midtrans order</TableHead>
              <TableHead>Nominal</TableHead>
              <TableHead>Status provider</TableHead>
              <TableHead>Terakhir dicoba</TableHead>
              <TableHead className="pr-4 text-right">Tindakan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providerCancelFailures.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell className="pl-4">
                  <OrderLink order={payment.order} />
                </TableCell>
                <TableCell className="font-mono text-xs text-zinc-500">
                  {payment.midtransOrderId}
                </TableCell>
                <TableCell className="font-medium">
                  {formatPrice(payment.amount)}
                </TableCell>
                <TableCell>
                  <Badge variant="destructive">
                    {payment.providerCancelStatus ?? "failed"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-zinc-500">
                  {formatAuditDate(payment.providerCancelRequestedAt)}
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <PaymentAuditAction
                    action="retry-cancel"
                    targetId={payment.id}
                    icon={XCircle}
                    label="Retry cancel"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AuditSection>

      <AuditSection
        title="Payment pending lewat expiry"
        description="Payment pending yang sudah melewati batas waktu dan perlu worker expiry/reconciliation."
        empty="Tidak ada pending payment yang lewat expiry."
        count={expiredPendingPayments.length}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Order</TableHead>
              <TableHead>Midtrans order</TableHead>
              <TableHead>Nominal</TableHead>
              <TableHead>Expired</TableHead>
              <TableHead className="pr-4 text-right">Tindakan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expiredPendingPayments.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell className="pl-4">
                  <OrderLink order={payment.order} />
                </TableCell>
                <TableCell className="font-mono text-xs text-zinc-500">
                  {payment.midtransOrderId}
                </TableCell>
                <TableCell className="font-medium">
                  {formatPrice(payment.amount)}
                </TableCell>
                <TableCell className="text-xs text-zinc-500">
                  {formatAuditDate(payment.expiresAt)}
                </TableCell>
                <TableCell className="pr-4">
                  <div className="flex justify-end gap-2">
                    <PaymentAuditAction
                      action="reconcile"
                      targetId={payment.id}
                      icon={RefreshCw}
                      label="Sync"
                    />
                    <PaymentAuditAction
                      action="expire"
                      targetId={payment.id}
                      icon={Hourglass}
                      label="Expire"
                      variant="destructive"
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AuditSection>

      <AuditSection
        title="Webhook & sync gagal"
        description="Event gagal dalam 24 jam terakhir."
        empty="Tidak ada webhook atau sync gagal 24 jam terakhir."
        count={webhookFailures.length + reconciliationFailures.length}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <EventTable
            title="Webhook"
            rows={webhookFailures.map((event) => ({
              id: event.id,
              result: event.result,
              variant: WEBHOOK_RESULT_VARIANT[event.result],
              order: event.payment?.order,
              midtransOrderId: event.midtransOrderId,
              error: event.error,
              at: event.receivedAt,
            }))}
          />
          <EventTable
            title="Reconciliation"
            rows={reconciliationFailures.map((event) => ({
              id: event.id,
              result: event.result,
              variant: RECONCILIATION_RESULT_VARIANT[event.result],
              order: event.payment?.order,
              midtransOrderId: event.midtransOrderId,
              error: event.error,
              at: event.checkedAt,
            }))}
          />
        </div>
      </AuditSection>
    </div>
  );
}

function AuditSection({
  title,
  description,
  empty,
  count,
  children,
}: {
  title: string;
  description: string;
  empty: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {count > 0 ? children : <p className="p-6 text-sm text-zinc-500">{empty}</p>}
      </CardContent>
    </Card>
  );
}

function EventTable({
  title,
  rows,
}: {
  title: string;
  rows: {
    id: string;
    result: string;
    variant: "default" | "secondary" | "success" | "outline" | "destructive";
    order?: { id: string; orderNumber: string } | null;
    midtransOrderId: string | null;
    error: string | null;
    at: Date;
  }[];
}) {
  if (rows.length === 0) {
    return (
      <div className="px-4 pb-4">
        <p className="rounded-lg border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">
          {title}: aman.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      <div className="px-4 pb-2 text-sm font-medium">{title}</div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Order</TableHead>
            <TableHead>Result</TableHead>
            <TableHead>Waktu</TableHead>
            <TableHead>Error</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="pl-4">
                <OrderLink
                  order={row.order}
                  fallback={row.midtransOrderId ?? "-"}
                />
              </TableCell>
              <TableCell>
                <Badge variant={row.variant}>{row.result}</Badge>
              </TableCell>
              <TableCell className="text-xs text-zinc-500">
                {formatAuditDate(row.at)}
              </TableCell>
              <TableCell className="max-w-[14rem] truncate text-xs text-zinc-800">
                {row.error ?? "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function OrderLink({
  order,
  fallback = "-",
}: {
  order?: { id: string; orderNumber: string } | null;
  fallback?: string;
}) {
  if (!order) return <span className="text-xs text-zinc-400">{fallback}</span>;
  return (
    <Link
      href={`/dashboard/orders/${order.id}`}
      className="inline-flex items-center gap-1 text-sm font-medium text-zinc-900 hover:underline"
    >
      {order.orderNumber}
      <ExternalLink className="h-3 w-3 text-zinc-400" />
    </Link>
  );
}

function formatAuditDate(date: Date | null | undefined) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
