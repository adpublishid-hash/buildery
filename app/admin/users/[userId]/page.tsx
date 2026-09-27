import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { UserRowActions } from "@/components/admin/user-row-actions";
import { requireSuperAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { isSuperAdminEmail } from "@/lib/super-admin";

export default async function AdminUserDetailPage({ params }: { params: { userId: string } }) {
  const admin = await requireSuperAdmin();
  const [user, plans, audit] = await Promise.all([
    prisma.user.findUnique({ where: { id: params.userId }, include: { subscription: { include: { plan: true } }, createdWorkspaces: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, name: true, slug: true, status: true } }, _count: { select: { createdWorkspaces: true, workspaceMembers: true, saasInvoices: true } } } }),
    prisma.saaSPlan.findMany({ select: { id: true, name: true, tier: true, monthlyPrice: true }, orderBy: { sortOrder: "asc" } }),
    prisma.platformAuditLog.findMany({ where: { OR: [{ targetType: "user", targetId: params.userId }, { actorId: params.userId }] }, include: { actor: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  if (!user) notFound();

  return <div className="w-full min-w-0">
    <div className="mb-2"><Button asChild variant="ghost" size="sm"><Link href="/admin/users">Kembali ke users</Link></Button></div>
    <PageHeader title={user.name ?? user.email} description={user.email} />
    <div className="mb-6 grid gap-4 sm:grid-cols-3">
      <Card><CardContent className="pt-6"><p className="text-xs text-zinc-500">Status</p><div className="mt-2 flex items-center gap-2"><Badge>{user.role}</Badge>{user.deletedAt ? <Badge variant="destructive">Karantina</Badge> : <Badge variant="success">Aktif</Badge>}</div></CardContent></Card>
      <Card><CardContent className="pt-6"><p className="text-xs text-zinc-500">Plan</p><p className="mt-2 font-medium">{user.subscription?.plan.name ?? "Free"}</p><p className="text-xs text-zinc-500">{user.subscription?.currentPeriodEnd ? `hingga ${formatDate(user.subscription.currentPeriodEnd)}` : "tanpa jatuh tempo"}</p></CardContent></Card>
      <Card><CardContent className="flex items-center justify-between pt-6"><div><p className="text-xs text-zinc-500">Workspace</p><p className="mt-2 text-2xl font-semibold">{user._count.createdWorkspaces}</p></div><UserRowActions userId={user.id} userEmail={user.email} role={user.role} isSelf={user.id === admin.id} isPlatformSuperAdmin={isSuperAdminEmail(user.email)} currentPlanTier={user.subscription?.plan.tier ?? "FREE"} plans={plans} isQuarantined={Boolean(user.deletedAt)} /></CardContent></Card>
    </div>
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Workspace dimiliki</CardTitle></CardHeader><CardContent className="space-y-3">{user.createdWorkspaces.map((workspace) => <Link key={workspace.id} href={`/admin/workspaces/${workspace.id}`} className="flex items-center justify-between border-b pb-3 text-sm last:border-0"><span><span className="font-medium">{workspace.name}</span><span className="block text-xs text-zinc-500">/{workspace.slug}</span></span><Badge variant="outline">{workspace.status}</Badge></Link>)}</CardContent></Card>
      <Card><CardHeader><CardTitle>Aktivitas admin</CardTitle></CardHeader><CardContent className="space-y-3">{audit.length ? audit.map((entry) => <div key={entry.id} className="border-b pb-3 text-sm last:border-0"><p>{entry.summary}</p><p className="text-xs text-zinc-500">{entry.actor?.email ?? "System"} · {formatDate(entry.createdAt)}</p></div>) : <p className="text-sm text-zinc-500">Belum ada aktivitas.</p>}</CardContent></Card>
    </div>
  </div>;
}
