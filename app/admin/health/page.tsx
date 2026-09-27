import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { requireSuperAdmin } from "@/lib/admin";
import { getJobHealth, isUnhealthy } from "@/lib/jobs/health";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export default async function AdminHealthPage() {
  await requireSuperAdmin();
  const now = new Date(); const dayAgo = new Date(now.getTime() - 86_400_000); const sslLimit = new Date(now.getTime() + 30 * 86_400_000);
  const [jobs, openErrors, failedWebhooks, failedAdEvents, sslExpiring, overdueInvoices, uploadStats] = await Promise.all([
    getJobHealth(),
    prisma.errorEvent.count({ where: { resolvedAt: null, lastSeenAt: { gte: dayAgo } } }),
    prisma.paymentWebhookEvent.count({ where: { result: "PROCESSING_FAILED", createdAt: { gte: dayAgo } } }),
    prisma.metaCapiEvent.count({ where: { failedAt: { gte: dayAgo }, sentAt: null } }),
    prisma.workspace.count({ where: { customDomainSslExpiresAt: { lte: sslLimit }, customDomainSslStatus: "ACTIVE" } }),
    prisma.saaSInvoice.count({ where: { status: { in: ["AWAITING_PAYMENT", "AWAITING_VERIFICATION"] }, expiresAt: { lt: now } } }),
    prisma.uploadFile.aggregate({ _sum: { size: true }, _count: { _all: true } }),
  ]);
  const incidents = jobs.unhealthy + openErrors + failedWebhooks + failedAdEvents + sslExpiring + overdueInvoices;
  const stats = [["Insiden aktif", incidents], ["Error 24 jam", openErrors], ["Webhook gagal", failedWebhooks], ["Ad delivery gagal", failedAdEvents], ["SSL < 30 hari", sslExpiring], ["Invoice lewat SLA", overdueInvoices]] as const;
  return <div className="w-full min-w-0"><PageHeader title="Platform health" description="Sinyal operasional untuk worker, integrasi, billing, domain, dan penyimpanan." /><section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">{stats.map(([label, value]) => <StatCard key={label} label={label} value={String(value)} delta={value ? "Perlu diperiksa" : "Normal"} trend={value ? "up" : "neutral"} icon={value ? AlertTriangle : CheckCircle2} />)}</section><Card className="mb-6"><CardHeader><CardTitle>Background jobs</CardTitle></CardHeader><CardContent className="divide-y p-0">{jobs.rows.map((job) => <div key={job.kind} className="flex items-center justify-between gap-4 px-4 py-3"><div><p className="text-sm font-medium">{job.kind}</p><p className="text-xs text-zinc-500">Interval {job.intervalMinutes} menit · terakhir {job.lastFinishedAt ? formatDate(job.lastFinishedAt) : "belum pernah"}{job.lastError ? ` · ${job.lastError}` : ""}</p></div><Badge variant={isUnhealthy(job.state) ? "destructive" : "outline"}>{job.state}</Badge></div>)}</CardContent></Card><Card><CardHeader><CardTitle>Storage</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{((uploadStats._sum.size ?? 0) / 1024 / 1024).toLocaleString("id-ID", { maximumFractionDigits: 1 })} MB</p><p className="text-sm text-zinc-500">{uploadStats._count._all.toLocaleString("id-ID")} file tercatat</p></CardContent></Card></div>;
}
