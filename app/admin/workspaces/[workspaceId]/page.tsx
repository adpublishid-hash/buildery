import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { WorkspaceDeleteButton } from "@/components/admin/workspace-delete-button";
import { WorkspaceStatusButton } from "@/components/admin/workspace-status-button";
import { requireSuperAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export default async function AdminWorkspaceDetailPage({ params }: { params: { workspaceId: string } }) {
  await requireSuperAdmin();
  const workspace = await prisma.workspace.findUnique({ where: { id: params.workspaceId }, include: { createdBy: { select: { id: true, email: true, name: true } }, _count: { select: { members: true, websites: true, products: true, orders: true, courses: true, customers: true, uploads: true } }, auditLogs: { include: { actor: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 25 } } });
  if (!workspace) notFound();
  const metrics = [["Members", workspace._count.members], ["Websites", workspace._count.websites], ["Products", workspace._count.products], ["Orders", workspace._count.orders], ["Courses", workspace._count.courses], ["Customers", workspace._count.customers], ["Uploads", workspace._count.uploads]] as const;
  return <div className="w-full min-w-0">
    <div className="mb-2"><Button asChild variant="ghost" size="sm"><Link href="/admin/workspaces">Kembali ke workspaces</Link></Button></div>
    <div className="flex items-start justify-between gap-4"><PageHeader title={workspace.name} description={`/${workspace.slug} · dibuat ${formatDate(workspace.createdAt)}`} /><div className="flex"><WorkspaceStatusButton workspaceId={workspace.id} status={workspace.status} />{workspace.status !== "PENDING_DELETION" ? <WorkspaceDeleteButton workspaceId={workspace.id} workspaceName={workspace.name} /> : null}</div></div>
    <Card className="mb-6"><CardContent className="flex flex-wrap items-center gap-4 pt-6 text-sm"><Badge variant={workspace.status === "ACTIVE" ? "success" : "secondary"}>{workspace.status}</Badge><span>Owner: <Link href={`/admin/users/${workspace.createdBy.id}`} className="font-medium hover:underline">{workspace.createdBy.email}</Link></span>{workspace.customDomain ? <span>Domain: {workspace.customDomain}</span> : null}{workspace.deleteAfter ? <span className="text-red-600">Hapus setelah {formatDate(workspace.deleteAfter)}</span> : null}</CardContent></Card>
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">{metrics.map(([label, value]) => <Card key={label}><CardContent className="p-4"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>Riwayat workspace</CardTitle></CardHeader><CardContent className="space-y-3">{workspace.auditLogs.length ? workspace.auditLogs.map((entry) => <div key={entry.id} className="border-b pb-3 text-sm last:border-0"><p>{entry.summary}</p><p className="text-xs text-zinc-500">{entry.actor?.email ?? "System"} · {formatDate(entry.createdAt)}</p></div>) : <p className="text-sm text-zinc-500">Belum ada aktivitas.</p>}</CardContent></Card>
  </div>;
}
