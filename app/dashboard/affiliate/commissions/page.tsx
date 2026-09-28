import Link from "next/link";
import { CircleCheck, Clock3, Coins, Undo2, Wallet } from "lucide-react";
import type { CommissionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { getAffiliateNavCounts } from "@/lib/affiliate-overview";
import { summarizeCommissions } from "@/lib/affiliate-dashboard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TabBar } from "@/components/ui/tab-bar";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel } from "@/components/dashboard/panel";
import { StatCard } from "@/components/dashboard/stat-card";
import { AffiliateNav } from "@/components/affiliate/affiliate-nav";
import { CommissionStatusControl } from "@/components/affiliate/commission-status-control";
import { CommissionToolbar } from "@/components/affiliate/commission-toolbar";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { formatPrice } from "@/lib/store";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Commissions · My Landing" };

const PAGE_SIZE = 50;
const STATUS_TABS: { key: "ALL" | CommissionStatus; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "PAYOUT_SCHEDULED", label: "In payout" },
  { key: "PAID", label: "Paid" },
  { key: "REVERSED", label: "Reversed" },
];

const SOURCE_LABEL = { ORDER: "Order", ENROLLMENT: "Course", MEMBERSHIP: "Membership" } as const;

export default async function CommissionsPage({ searchParams }: { searchParams?: { page?: string; status?: string } }) {
  const { workspace, role } = await requireCurrentWorkspace();
  const canEdit = canInWorkspace(role, "affiliate.manage");
  const page = parsePage(searchParams?.page);
  const status = STATUS_TABS.find((item) => item.key !== "ALL" && item.key === searchParams?.status)?.key as
    | CommissionStatus
    | undefined;
  const where = { workspaceId: workspace.id, ...(status ? { status } : {}) };

  const [commissions, totalCommissions, totals, navCounts] = await Promise.all([prisma.commission.findMany({
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
    by: ["status"], where: { workspaceId: workspace.id }, _count: { _all: true }, _sum: { amount: true, adjustedAmount: true },
  }), getAffiliateNavCounts(workspace.id)]);

  const summary = summarizeCommissions(totals);
  const countByStatus = new Map(totals.map((row) => [row.status, row._count._all]));
  const hasAny = totals.some((row) => row._count._all > 0);

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Affiliate"
        description="Commission ledger across products, courses, and memberships."
        action={hasAny ? <CommissionToolbar canManage={canEdit} readyCount={navCounts.pendingCommissions} /> : null}
      />
      <AffiliateNav {...navCounts} />

      {!hasAny ? (
        <EmptyState
          icon={Coins}
          title="No commissions yet"
          description="Commissions appear here when affiliates drive sales through their referral links."
        />
      ) : (
        <>
          <div className="mb-[16px] grid grid-cols-1 gap-[12px] sm:grid-cols-2 xl:grid-cols-4">
            <StatCard index={0} label="Pending" value={formatPrice(summary.pending)} delta={`${navCounts.pendingCommissions} ready to approve`} icon={Clock3} />
            <StatCard index={1} label="Approved" value={formatPrice(summary.approved)} delta={`${navCounts.eligiblePayouts} ${navCounts.eligiblePayouts === 1 ? "affiliate" : "affiliates"} ready for payout`} icon={CircleCheck} />
            <StatCard index={2} label="Paid out" value={formatPrice(summary.paid)} delta={`${formatPrice(summary.scheduled)} in open payouts`} icon={Wallet} />
            <StatCard index={3} label="Reversed" value={formatPrice(summary.reversed)} delta="Refunds and cancellations" icon={Undo2} />
          </div>
          <Panel title="Commission ledger" icon={Coins}>
            <div className="border-b-[0.8px] border-kv-border p-[10px]">
              <TabBar
                ariaLabel="Filter commissions by status"
                active={status ?? "ALL"}
                items={STATUS_TABS.map((tab) => ({
                  key: tab.key,
                  label: tab.label,
                  href: tab.key === "ALL" ? "/dashboard/affiliate/commissions" : `/dashboard/affiliate/commissions?status=${tab.key}`,
                  count: tab.key === "ALL" ? undefined : countByStatus.get(tab.key),
                }))}
              />
            </div>
            {commissions.length === 0 ? (
              <p className="px-[16px] py-[40px] text-center text-[12px] text-kv-muted-fg">No commissions with this status.</p>
            ) : (
              <Table className="min-w-[860px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-[14px]">Affiliate</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Net amount</TableHead>
                    <TableHead>Adjustments</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="pr-[14px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="pl-[14px]">
                        <p className="text-[13px] font-medium text-kv-fg">{c.affiliate.customer.name}</p>
                        <p className="text-[12px] text-kv-muted-fg">{c.affiliate.customer.email}</p>
                      </TableCell>
                      <TableCell>
                        {c.order ? (
                          <Link href={`/dashboard/orders/${c.order.id}`} className="text-[13px] text-kv-fg hover:underline">
                            {c.order.orderNumber}
                          </Link>
                        ) : (
                          <span className="text-[13px] text-kv-secondary-fg">{c.sourceLabel ?? SOURCE_LABEL[c.sourceType]}</span>
                        )}
                        <p className="text-[11px] text-kv-muted-fg">{SOURCE_LABEL[c.sourceType]}</p>
                      </TableCell>
                      <TableCell className="kv-tabular text-right text-[13px] text-kv-secondary-fg">
                        {(c.rateBps || c.percent * 100) / 100}%
                      </TableCell>
                      <TableCell className="kv-tabular text-right">
                        <p className="text-[13px] font-medium text-kv-fg">{formatPrice(c.amount)}</p>
                        {c.adjustedAmount > 0 ? (
                          <p className="text-[11px] text-kv-muted-fg">
                            of {formatPrice(c.originalAmount ?? c.amount + c.adjustedAmount)}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-[12px] text-kv-muted-fg">
                        {c.adjustments.length > 0 ? (
                          <div className="space-y-[2px]">
                            {c.adjustments.map((adjustment) => (
                              <p key={adjustment.id}>
                                −{formatPrice(adjustment.amount)} ·{" "}
                                {adjustment.type.endsWith("REFUND") ? "refund" : adjustment.type === "MANUAL" ? "manual" : "cancellation"}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <span className="text-kv-subtle">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-[12px] text-kv-muted-fg">{formatDate(c.createdAt)}</TableCell>
                      <TableCell className="pr-[14px]">
                        <CommissionStatusControl
                          commissionId={c.id}
                          status={c.status}
                          availableAt={c.availableAt}
                          canManage={canEdit}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <Pagination
              page={page}
              total={totalCommissions}
              pageSize={PAGE_SIZE}
              basePath="/dashboard/affiliate/commissions"
              params={{ status }}
            />
          </Panel>
        </>
      )}
    </div>
  );
}
