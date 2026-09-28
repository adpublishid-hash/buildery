import { Banknote, CircleCheck, Hourglass, Wallet } from "lucide-react";
import type { AffiliatePayoutStatus } from "@prisma/client";

import { AffiliateNav } from "@/components/affiliate/affiliate-nav";
import { CreatePayoutButton, PayoutStatusActions } from "@/components/affiliate/payout-actions";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel } from "@/components/dashboard/panel";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAffiliateNavCounts, UNBATCHED_COMMISSION } from "@/lib/affiliate-overview";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/store";
import { formatDate } from "@/lib/utils";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { decryptPayoutDetails } from "@/lib/affiliate-payout-details";

export const metadata = { title: "Affiliate payouts · My Landing" };

const PAYOUT_STATUS: Record<AffiliatePayoutStatus, { label: string; dot: string }> = {
  DRAFT: { label: "Draft", dot: "before:bg-kv-subtle" },
  PROCESSING: { label: "Processing", dot: "before:bg-amber-500" },
  PAID: { label: "Paid", dot: "" },
  FAILED: { label: "Failed", dot: "before:bg-red-500" },
  CANCELLED: { label: "Cancelled", dot: "before:bg-kv-subtle" },
};

export default async function AffiliatePayoutsPage() {
  const { workspace, role } = await requireCurrentWorkspace();
  const canPayout = canInWorkspace(role, "affiliate.payout");
  const [eligible, payouts, payoutTotals, navCounts] = await Promise.all([
    prisma.commission.findMany({
      where: { workspaceId: workspace.id, ...UNBATCHED_COMMISSION },
      include: { affiliate: { include: { customer: { select: { name: true, email: true } }, program: { select: { minimumPayout: true } } } } },
    }),
    prisma.affiliatePayout.findMany({
      where: { workspaceId: workspace.id },
      include: { affiliate: { include: { customer: { select: { name: true, email: true } } } }, _count: { select: { items: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.affiliatePayout.groupBy({
      by: ["status"],
      where: { workspaceId: workspace.id },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    getAffiliateNavCounts(workspace.id),
  ]);
  const balances = new Map<string, { affiliate: (typeof eligible)[number]["affiliate"]; amount: number; count: number }>();
  for (const commission of eligible) {
    const current = balances.get(commission.affiliateId) ?? { affiliate: commission.affiliate, amount: 0, count: 0 };
    current.amount += commission.amount;
    current.count += 1;
    balances.set(commission.affiliateId, current);
  }
  const balanceRows = Array.from(balances.entries()).sort((a, b) => b[1].amount - a[1].amount);
  const approvedBalance = balanceRows.reduce((sum, [, row]) => sum + row.amount, 0);
  const readyCount = balanceRows.filter(
    ([, row]) =>
      row.amount >= row.affiliate.program.minimumPayout &&
      (row.affiliate.status === "ACTIVE" || row.affiliate.status === "SUSPENDED")
  ).length;
  const totalFor = (...statuses: AffiliatePayoutStatus[]) =>
    payoutTotals.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + (row._sum.amount ?? 0), 0);
  const openCount = payoutTotals
    .filter((row) => row.status === "DRAFT" || row.status === "PROCESSING")
    .reduce((sum, row) => sum + row._count._all, 0);

  return <div className="w-full min-w-0">
    <PageHeader title="Affiliate" description="Create auditable payout batches from approved commissions." />
    <AffiliateNav {...navCounts} />

    <div className="mb-[16px] grid grid-cols-1 gap-[12px] sm:grid-cols-3">
      <StatCard index={0} label="Approved balance" value={formatPrice(approvedBalance)} delta={`${readyCount} of ${balanceRows.length} ${balanceRows.length === 1 ? "affiliate" : "affiliates"} ready to pay`} icon={Wallet} />
      <StatCard index={1} label="Open payouts" value={formatPrice(totalFor("DRAFT", "PROCESSING"))} delta={`${openCount} ${openCount === 1 ? "batch" : "batches"} awaiting transfer`} icon={Hourglass} />
      <StatCard index={2} label="Paid out" value={formatPrice(totalFor("PAID"))} delta="All settled payouts" icon={CircleCheck} />
    </div>

    {balanceRows.length ? <Panel title="Ready for payout" icon={Wallet} className="mb-[16px]">
      <Table className="min-w-[720px]"><TableHeader><TableRow><TableHead className="pl-[14px]">Affiliate</TableHead><TableHead>Approved balance</TableHead><TableHead>Payout account</TableHead><TableHead className="pr-[14px] text-right">Action</TableHead></TableRow></TableHeader>
        <TableBody>{balanceRows.map(([affiliateId, balance]) => {
          const minimum = balance.affiliate.program.minimumPayout;
          const progress = minimum > 0 ? Math.min(100, Math.round((balance.amount / minimum) * 100)) : 100;
          const ready = balance.amount >= minimum;
          // Payouts go only to affiliates in good standing (see createAffiliatePayoutAction).
          const payable = balance.affiliate.status === "ACTIVE" || balance.affiliate.status === "SUSPENDED";
          return <TableRow key={affiliateId}>
            <TableCell className="pl-[14px]"><p className="text-[13px] font-medium text-kv-fg">{balance.affiliate.customer.name}</p><p className="text-[12px] text-kv-muted-fg">{balance.affiliate.customer.email}</p></TableCell>
            <TableCell>
              <p className="kv-tabular text-[13px] font-medium text-kv-fg">{formatPrice(balance.amount)}</p>
              <div className="mt-[4px] flex items-center gap-[8px]">
                <div className="h-[4px] w-[96px] overflow-hidden rounded-full bg-kv-secondary" aria-hidden><div className="h-full rounded-full bg-kv-fg" style={{ width: `${progress}%` }} /></div>
                <span className="text-[11px] text-kv-muted-fg">{ready ? `${balance.count} ${balance.count === 1 ? "commission" : "commissions"}` : `min. ${formatPrice(minimum)}`}</span>
              </div>
            </TableCell>
            <TableCell className="text-[12px] text-kv-muted-fg">{balance.affiliate.payoutAccountLabel ?? <span className="text-amber-700">Not set by affiliate yet</span>}{canPayout && balance.affiliate.payoutDetailsEncrypted ? <span className="block font-mono text-kv-secondary-fg">{decryptPayoutDetails(balance.affiliate.payoutDetailsEncrypted)}</span> : null}</TableCell>
            <TableCell className="pr-[14px] text-right">{canPayout && ready && payable ? <CreatePayoutButton affiliateId={affiliateId} /> : <span className="text-[12px] text-kv-muted-fg">{!payable ? `Affiliate is ${balance.affiliate.status.toLowerCase()}` : ready ? "—" : "Below minimum"}</span>}</TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>
    </Panel> : null}

    {payouts.length ? <Panel title="Payout history" icon={Banknote}><Table className="min-w-[900px]">
      <TableHeader><TableRow><TableHead className="pl-[14px]">Affiliate</TableHead><TableHead>Amount</TableHead><TableHead className="text-right">Items</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead className="pr-[14px]">Settlement</TableHead></TableRow></TableHeader>
      <TableBody>{payouts.map((payout) => <TableRow key={payout.id}>
        <TableCell className="pl-[14px]"><p className="text-[13px] font-medium text-kv-fg">{payout.affiliate.customer.name}</p><p className="text-[12px] text-kv-muted-fg">{payout.affiliate.customer.email}</p></TableCell>
        <TableCell className="kv-tabular"><p className="text-[13px] font-medium text-kv-fg">{formatPrice(payout.amount)}</p>{payout.adjustmentAmount > 0 ? <p className="text-[11px] text-kv-muted-fg">{formatPrice(payout.grossAmount)} gross − {formatPrice(payout.adjustmentAmount)} clawback</p> : null}</TableCell>
        <TableCell className="kv-tabular text-right text-[13px]">{payout._count.items}</TableCell>
        <TableCell><Badge variant="success" className={PAYOUT_STATUS[payout.status].dot}>{PAYOUT_STATUS[payout.status].label}</Badge>{payout.reference ? <p className="mt-[4px] font-mono text-[11px] text-kv-muted-fg">{payout.reference}</p> : null}{payout.status === "FAILED" && payout.failureReason ? <p className="mt-[4px] max-w-[200px] truncate text-[11px] text-red-600" title={payout.failureReason}>{payout.failureReason}</p> : null}</TableCell>
        <TableCell className="whitespace-nowrap text-[12px] text-kv-muted-fg">{formatDate(payout.createdAt)}{payout.paidAt ? <span className="block">Paid {formatDate(payout.paidAt)}</span> : null}</TableCell>
        <TableCell className="pr-[14px]">{canPayout ? <><p className="mb-[6px] max-w-[280px] text-[12px] text-kv-muted-fg">{payout.accountLabel}{payout.accountDetailsEncrypted ? <span className="block font-mono text-kv-secondary-fg">{decryptPayoutDetails(payout.accountDetailsEncrypted)}</span> : null}</p><PayoutStatusActions payoutId={payout.id} status={payout.status} /></> : null}</TableCell>
      </TableRow>)}</TableBody>
    </Table></Panel> : <EmptyState icon={Banknote} title="No payouts yet" description={balanceRows.length ? "Create a payout for an affiliate above once their approved balance reaches the minimum." : "Approve eligible commissions first, then create the first payout batch here."} />}
  </div>;
}
