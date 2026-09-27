import { notFound, redirect } from "next/navigation";
import { Copy, MousePointerClick, ShoppingBag, WalletCards } from "lucide-react";

import { AffiliatePayoutSettingsForm } from "@/components/affiliate/affiliate-payout-settings-form";
import { StoreHeader } from "@/components/store/store-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMemberSession } from "@/lib/member-auth";
import { prisma } from "@/lib/prisma";
import { publicSiteContextHref } from "@/lib/public-url-server";
import { getStoreWorkspace } from "@/lib/store";
import { formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Affiliate dashboard" };

export default async function MemberAffiliatePage({ params }: { params: { workspaceSlug: string } }) {
  const workspace = await getStoreWorkspace(params.workspaceSlug);
  if (!workspace) notFound();
  const session = await getMemberSession(workspace.slug);
  if (!session) redirect(publicSiteContextHref(workspace.slug, `member/login?callbackUrl=${encodeURIComponent(publicSiteContextHref(workspace.slug, "member/affiliate"))}`));
  const affiliate = await prisma.affiliate.findFirst({
    where: { workspaceId: workspace.id, customerId: session.customerId, status: { not: "ARCHIVED" } },
    include: {
      program: { include: { creatives: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } } },
      referrals: { where: { isBot: false }, select: { event: true } },
      commissions: { orderBy: { createdAt: "desc" }, take: 50 },
      payouts: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!affiliate) notFound();
  const clicks = affiliate.referrals.filter((item) => item.event === "CLICK").length;
  const sales = affiliate.referrals.filter((item) => item.event === "SALE").length;
  const earned = affiliate.commissions.filter((item) => item.status !== "REVERSED").reduce((sum, item) => sum + item.amount, 0);
  const referralUrl = `${(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "")}/r/${affiliate.referralCode}`;
  return <div className="min-h-screen bg-zinc-50 text-zinc-950">
    <StoreHeader workspaceSlug={workspace.slug} workspaceName={workspace.name} workspaceId={workspace.id} logoUrl={workspace.logoUrl} />
    <main className="mx-auto max-w-5xl px-5 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">Affiliate dashboard</h1><p className="mt-1 text-sm text-zinc-500">Performance, commissions, and payout history.</p></div><Badge variant="outline">{affiliate.status}</Badge></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat icon={MousePointerClick} label="Clicks" value={String(clicks)} /><Stat icon={ShoppingBag} label="Sales" value={String(sales)} /><Stat icon={WalletCards} label="Earned" value={formatPrice(earned)} /><Stat icon={Copy} label="Conversion" value={`${clicks ? ((sales / clicks) * 100).toFixed(1) : "0.0"}%`} /></div>
      <Card className="mt-6"><CardHeader><CardTitle className="text-base">Referral link</CardTitle></CardHeader><CardContent><p className="break-all rounded-md bg-zinc-100 p-3 font-mono text-sm">{referralUrl}</p></CardContent></Card>
      {affiliate.program.creatives.length ? <Card className="mt-6"><CardHeader><CardTitle className="text-base">Campaign resources</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{affiliate.program.creatives.map((creative) => <div key={creative.id} className="rounded-lg border border-zinc-200 p-3"><p className="text-sm font-medium">{creative.title}</p>{creative.type === "IMAGE" ? <div role="img" aria-label={creative.title} className="mt-3 aspect-video w-full rounded-md border border-zinc-100 bg-zinc-50 bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(creative.content).slice(1, -1)})` }} /> : creative.type === "LINK" ? <a className="mt-2 block break-all text-xs font-medium text-zinc-700 underline" href={creative.content} target="_blank" rel="noreferrer">{creative.content}</a> : <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-zinc-600">{creative.content}</p>}{creative.targetUrl ? <a className="mt-3 inline-block text-xs font-medium underline" href={creative.targetUrl} target="_blank" rel="noreferrer">Open target</a> : null}</div>)}</CardContent></Card> : null}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-base">Payout settings</CardTitle></CardHeader><CardContent><AffiliatePayoutSettingsForm workspaceSlug={workspace.slug} accountLabel={affiliate.payoutAccountLabel ?? ""} method={affiliate.payoutMethod} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Payout history</CardTitle></CardHeader><CardContent className="space-y-3">{affiliate.payouts.length ? affiliate.payouts.map((payout) => <div key={payout.id} className="flex items-center justify-between border-b border-zinc-100 pb-3 text-sm"><div><p className="font-medium">{formatPrice(payout.amount)}</p>{payout.adjustmentAmount > 0 ? <p className="text-xs text-zinc-500">Includes {formatPrice(payout.adjustmentAmount)} clawback</p> : null}<p className="text-xs text-zinc-500">{payout.reference ?? "Awaiting settlement"}</p></div><Badge variant="outline">{payout.status}</Badge></div>) : <p className="text-sm text-zinc-500">No payouts yet.</p>}</CardContent></Card>
      </div>
    </main>
  </div>;
}

function Stat({ icon: Icon, label, value }: { icon: typeof MousePointerClick; label: string; value: string }) {
  return <div className="rounded-lg border border-zinc-200 bg-white p-4"><Icon className="h-4 w-4 text-zinc-400" /><p className="mt-3 text-xs text-zinc-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}
