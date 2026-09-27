import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Activity, ArrowLeft, CheckCircle2, Download, Globe2, Users, XCircle } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canInWorkspace, MEMBER_ROLE_LABEL } from "@/lib/permissions";
import { getUserPlan } from "@/lib/saas-limits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { CloneWorkspaceForm } from "@/components/workspaces/clone-workspace-form";

export const dynamic = "force-dynamic";

export default async function WorkspaceOverviewPage({ params }: { params: { workspaceId: string } }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: params.workspaceId, userId: session.user.id } },
    include: {
      workspace: {
        include: {
          integration: { select: { metaPixelId: true, metaCapiEnabled: true, googleAnalyticsId: true, googleTagManagerId: true, whatsappIsActive: true, telegramEnabled: true, mailketingEnabled: true, gmailOAuthEnabled: true } },
          _count: { select: { members: true, websites: true, products: true, courses: true, blogPosts: true, forms: true, customers: true, orders: true, submissions: true } },
        },
      },
    },
  });
  if (!membership) notFound();
  const workspace = membership.workspace;
  const [plan, failedJobs, pendingJobs, auditLogs] = await Promise.all([
    getUserPlan(workspace.createdById),
    prisma.scheduledJob.count({ where: { workspaceId: workspace.id, status: "FAILED" } }),
    prisma.scheduledJob.count({ where: { workspaceId: workspace.id, status: { in: ["PENDING", "RUNNING"] } } }),
    prisma.workspaceAuditLog.findMany({ where: { workspaceId: workspace.id }, include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 12 }),
  ]);
  const integration = workspace.integration;
  const checks = [
    { label: "Website", ok: workspace._count.websites > 0, detail: `${workspace._count.websites} website` },
    { label: "Tim", ok: workspace._count.members > 1, detail: `${workspace._count.members} anggota` },
    { label: "Custom domain", ok: workspace.customDomainStatus === "ACTIVE", detail: workspace.customDomain ? `${workspace.customDomainStatus} · HTTPS ${workspace.customDomainSslStatus}` : "Belum dikonfigurasi" },
    { label: "Analytics", ok: Boolean(integration?.googleAnalyticsId || integration?.googleTagManagerId || integration?.metaPixelId), detail: integration?.metaCapiEnabled ? "Tracking + Meta CAPI aktif" : "Periksa integrasi tracking" },
    { label: "Job queue", ok: failedJobs === 0, detail: `${failedJobs} gagal · ${pendingJobs} antre` },
  ];
  const healthScore = Math.round(checks.filter((check) => check.ok).length / checks.length * 100);

  return (
    <div className="w-full min-w-0 space-y-6">
      <Button asChild variant="ghost" size="sm"><Link href="/dashboard/workspaces"><ArrowLeft /> Workspaces</Link></Button>
      <PageHeader title={workspace.name} description={`Workspace health, usage, governance, dan portabilitas data · ${MEMBER_ROLE_LABEL[membership.role]}`} action={<><Badge variant={workspace.status === "ACTIVE" ? "success" : "secondary"}>{workspace.status.replaceAll("_", " ")}</Badge>{canInWorkspace(membership.role, "workspace.edit") && <Button asChild variant="outline"><a href={`/dashboard/workspaces/${workspace.id}/export`}><Download /> Export JSON</a></Button>}</>} />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="Health score" value={`${healthScore}%`} description="Kesiapan konfigurasi workspace" icon={Activity} />
        <Metric title="Members" value={`${workspace._count.members}${plan.memberLimit == null ? "" : ` / ${plan.memberLimit}`}`} description={`Batas paket ${plan.name}`} icon={Users} />
        <Metric title="Domain" value={workspace.customDomainStatus === "ACTIVE" ? "Verified" : "Needs setup"} description={workspace.customDomain ?? `${workspace.slug}.landing.my.id`} icon={Globe2} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <Card><CardHeader><CardTitle>Health center</CardTitle><CardDescription>Status konfigurasi penting tanpa menampilkan credential.</CardDescription></CardHeader><CardContent className="divide-y divide-zinc-200 dark:divide-zinc-800">{checks.map((check) => <div key={check.label} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"><div><p className="text-sm font-medium">{check.label}</p><p className="text-xs text-zinc-500">{check.detail}</p></div>{check.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-amber-500" />}</div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Usage</CardTitle><CardDescription>Ringkasan resource dan data operasional.</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-x-5 gap-y-4">{Object.entries({ Websites: workspace._count.websites, Products: workspace._count.products, Courses: workspace._count.courses, Posts: workspace._count.blogPosts, Forms: workspace._count.forms, Submissions: workspace._count.submissions, Customers: workspace._count.customers, Orders: workspace._count.orders }).map(([label, value]) => <div key={label} className="border-b border-zinc-100 pb-2 dark:border-zinc-900"><p className="text-xl font-semibold">{value}</p><p className="text-xs text-zinc-500">{label}</p></div>)}</CardContent></Card>
      </div>

      {canInWorkspace(membership.role, "workspace.edit") && workspace.status === "ACTIVE" ? <Card><CardHeader><CardTitle>Clone workspace</CardTitle><CardDescription>Salin struktur dan konfigurasi pilihan. Credential, transaksi, pelanggan, analitik, dan submission tidak pernah disalin.</CardDescription></CardHeader><CardContent><CloneWorkspaceForm workspaceId={workspace.id} workspaceName={workspace.name} workspaceSlug={workspace.slug} /></CardContent></Card> : null}

      <Card><CardHeader><CardTitle>Audit log</CardTitle><CardDescription>Aktivitas governance dan perubahan sensitif terbaru.</CardDescription></CardHeader><CardContent>{auditLogs.length ? <div className="divide-y divide-zinc-200 dark:divide-zinc-800">{auditLogs.map((log) => <div key={log.id} className="flex flex-col gap-1 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">{log.summary}</p><p className="text-xs text-zinc-500">{log.actor?.name ?? log.actor?.email ?? "Sistem"} · {log.action}</p></div><time className="text-xs text-zinc-400">{log.createdAt.toLocaleString("id-ID", { timeZone: workspace.timezone })}</time></div>)}</div> : <p className="text-sm text-zinc-500">Belum ada aktivitas tercatat.</p>}</CardContent></Card>
    </div>
  );
}

function Metric({ title, value, description, icon: Icon }: { title: string; value: string; description: string; icon: typeof Activity }) {
  return <Card><CardContent className="flex items-start justify-between p-5"><div><p className="text-xs font-medium text-zinc-500">{title}</p><p className="mt-1 text-2xl font-semibold">{value}</p><p className="mt-1 truncate text-xs text-zinc-500">{description}</p></div><Icon className="h-5 w-5 text-zinc-400" /></CardContent></Card>;
}
