import Link from "next/link";
import { Coins } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
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
import { AffiliateNav } from "@/components/affiliate/affiliate-nav";
import { CommissionStatusControl } from "@/components/affiliate/commission-status-control";
import { CommissionToolbar } from "@/components/affiliate/commission-toolbar";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { formatPrice } from "@/lib/store";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Commissions · My Landing" };

const PAGE_SIZE = 50;

export default async function CommissionsPage({ searchParams }: { searchParams?: { page?: string; status?: string } }) {
  const { workspace, role } = await requireCurrentWorkspace();
  const canEdit = canInWorkspace(role, "affiliate.manage");
  const page = parsePage(searchParams?.page);
  const allowedStatuses = ["PENDING", "APPROVED", "PAYOUT_SCHEDULED", "PAID", "REVERSED"] as const;
  const status = allowedStatuses.find((item) => item === searchParams?.status);
  const where = { workspaceId: workspace.id, ...(status ? { status } : {}) };

  const [commissions, totalCommissions, totals] = await Promise.all([prisma.commission.findMany({
    where,
    include: {
      affiliate: {
        include: { customer: { select: { name: true, email: true } } },
      },
      order: { select: { id: true, orderNumber: true } },
      adjustments: {
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { id: true, type: true, amount: true, createdAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  }), prisma.commission.count({ where }), prisma.commission.groupBy({
    by: ["status"], where: { workspaceId: workspace.id }, _sum: { amount: true, adjustedAmount: true },
  })]);

  const summary = totals.reduce(
    (acc, c) => {
      const amount = c._sum.amount ?? 0;
      acc.total += amount;
      if (c.status === "REVERSED") {
        acc.reversed += c._sum.adjustedAmount ?? 0;
      } else if (c.status === "PAYOUT_SCHEDULED") {
        acc.scheduled += amount;
      } else {
        acc[c.status.toLowerCase() as "pending" | "approved" | "paid"] +=
          amount;
      }
      return acc;
    },
    { total: 0, pending: 0, approved: 0, scheduled: 0, paid: 0, reversed: 0 }
  );

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Affiliate"
        description="Commission ledger across products, courses, and memberships."
      />
      <AffiliateNav />

      {commissions.length === 0 ? (
        <EmptyState
          icon={Coins}
          title="No commissions yet"
          description="Commissions appear here when affiliates drive sales through their referral links."
        />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-6">
            <Stat label="Net Total" amount={summary.total} />
            <Stat label="Pending" amount={summary.pending} />
            <Stat label="Approved" amount={summary.approved} />
            <Stat label="Scheduled" amount={summary.scheduled} />
            <Stat label="Paid" amount={summary.paid} />
            <Stat label="Reversed" amount={summary.reversed} />
          </div>
          <CommissionToolbar canManage={canEdit} />
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Affiliate</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Net Amount</TableHead>
                    <TableHead>Adjustment</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="pl-4">
                        <p className="text-sm font-medium text-zinc-900">
                          {c.affiliate.customer.name}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {c.affiliate.customer.email}
                        </p>
                      </TableCell>
                      <TableCell>
                        {c.order ? (
                          <Link
                            href={`/dashboard/orders/${c.order.id}`}
                            className="text-sm text-zinc-900 hover:underline"
                          >
                            {c.order.orderNumber}
                          </Link>
                        ) : (
                          <span className="text-xs text-zinc-600">{c.sourceLabel ?? c.sourceType.toLowerCase()}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-zinc-500">
                        {(c.rateBps || c.percent * 100) / 100}%
                      </TableCell>
                      <TableCell className="text-sm font-medium text-zinc-900">
                        <div>{formatPrice(c.amount)}</div>
                        {c.adjustedAmount > 0 ? (
                          <p className="mt-1 text-xs text-zinc-400">
                            dari {formatPrice(c.originalAmount ?? c.amount + c.adjustedAmount)}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500">
                        {c.adjustments.length > 0 ? (
                          <div className="space-y-1">
                            {c.adjustments.map((adjustment) => (
                              <p key={adjustment.id}>
                                -{formatPrice(adjustment.amount)} ·{" "}
                                {adjustment.type === "ORDER_REFUND"
                                  ? "refund"
                                  : "cancel"}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500">
                        {formatDate(c.createdAt)}
                      </TableCell>
                      <TableCell>
                        {canEdit ? (
                          <CommissionStatusControl
                            commissionId={c.id}
                            status={c.status}
                          />
                        ) : (
                          <span className="text-xs text-zinc-700">
                            {c.status.charAt(0) +
                              c.status.slice(1).toLowerCase()}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Pagination page={page} total={totalCommissions} pageSize={PAGE_SIZE} basePath="/dashboard/affiliate/commissions" />
        </>
      )}
    </div>
  );
}

function Stat({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wider text-zinc-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-zinc-900">
        {formatPrice(amount)}
      </p>
    </div>
  );
}
