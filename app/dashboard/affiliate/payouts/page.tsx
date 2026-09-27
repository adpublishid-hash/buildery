import { Banknote } from "lucide-react";

import { AffiliateNav } from "@/components/affiliate/affiliate-nav";
import { CreatePayoutButton, PayoutStatusActions } from "@/components/affiliate/payout-actions";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/store";
import { formatDate } from "@/lib/utils";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { decryptPayoutDetails } from "@/lib/affiliate-payout-details";

export const metadata = { title: "Affiliate payouts · My Landing" };

export default async function AffiliatePayoutsPage() {
  const { workspace, role } = await requireCurrentWorkspace();
  const canPayout = canInWorkspace(role, "affiliate.payout");
  const [eligible, payouts] = await Promise.all([
    prisma.commission.findMany({
      where: { workspaceId: workspace.id, status: "APPROVED", payoutItem: null },
      include: { affiliate: { include: { customer: { select: { name: true, email: true } }, program: { select: { minimumPayout: true } } } } },
    }),
    prisma.affiliatePayout.findMany({
      where: { workspaceId: workspace.id },
      include: { affiliate: { include: { customer: { select: { name: true, email: true } } } }, _count: { select: { items: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  const balances = new Map<string, { affiliate: (typeof eligible)[number]["affiliate"]; amount: number }>();
  for (const commission of eligible) {
    const current = balances.get(commission.affiliateId) ?? { affiliate: commission.affiliate, amount: 0 };
    current.amount += commission.amount;
    balances.set(commission.affiliateId, current);
  }

  return <div className="w-full min-w-0">
    <PageHeader title="Affiliate" description="Create auditable payout batches from approved commissions." />
    <AffiliateNav />
    {balances.size ? <Card className="mb-6"><CardContent className="p-0">
      <Table><TableHeader><TableRow><TableHead className="pl-4">Eligible affiliate</TableHead><TableHead>Approved balance</TableHead><TableHead>Minimum</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
        <TableBody>{Array.from(balances.entries()).map(([affiliateId, balance]) => <TableRow key={affiliateId}>
          <TableCell className="pl-4"><p className="font-medium">{balance.affiliate.customer.name}</p><p className="text-xs text-zinc-500">{balance.affiliate.customer.email}</p></TableCell>
          <TableCell>{formatPrice(balance.amount)}</TableCell>
          <TableCell>{formatPrice(balance.affiliate.program.minimumPayout)}</TableCell>
          <TableCell className="text-right"><div className="mb-2 text-xs text-zinc-500">{balance.affiliate.payoutAccountLabel ?? "Payout account not set"}{canPayout && balance.affiliate.payoutDetailsEncrypted ? <span className="block font-mono text-zinc-700">{decryptPayoutDetails(balance.affiliate.payoutDetailsEncrypted)}</span> : null}</div>{canPayout && balance.amount >= balance.affiliate.program.minimumPayout ? <CreatePayoutButton affiliateId={affiliateId} /> : <span className="text-xs text-zinc-400">Threshold not reached</span>}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </CardContent></Card> : null}

    {payouts.length ? <Card><CardContent className="p-0"><Table>
      <TableHeader><TableRow><TableHead className="pl-4">Affiliate</TableHead><TableHead>Amount</TableHead><TableHead>Items</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead>Settlement</TableHead></TableRow></TableHeader>
      <TableBody>{payouts.map((payout) => <TableRow key={payout.id}>
        <TableCell className="pl-4"><p className="font-medium">{payout.affiliate.customer.name}</p><p className="text-xs text-zinc-500">{payout.affiliate.customer.email}</p></TableCell>
        <TableCell className="font-medium"><p>{formatPrice(payout.amount)}</p>{payout.adjustmentAmount > 0 ? <p className="text-xs font-normal text-zinc-500">{formatPrice(payout.grossAmount)} gross - {formatPrice(payout.adjustmentAmount)} clawback</p> : null}</TableCell>
        <TableCell>{payout._count.items}</TableCell>
        <TableCell><Badge variant="outline">{payout.status.replace("_", " ")}</Badge>{payout.reference ? <p className="mt-1 text-xs text-zinc-500">{payout.reference}</p> : null}</TableCell>
        <TableCell className="text-xs text-zinc-500">{formatDate(payout.createdAt)}</TableCell>
        <TableCell>{canPayout ? <><p className="mb-2 max-w-[250px] text-xs text-zinc-500">{payout.accountLabel}{payout.accountDetailsEncrypted ? <span className="block font-mono text-zinc-700">{decryptPayoutDetails(payout.accountDetailsEncrypted)}</span> : null}</p><PayoutStatusActions payoutId={payout.id} status={payout.status} /></> : null}</TableCell>
      </TableRow>)}</TableBody>
    </Table></CardContent></Card> : <EmptyState icon={Banknote} title="No payouts yet" description="Approve eligible commissions, then create the first payout batch." />}
  </div>;
}
