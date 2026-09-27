import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { requireSuperAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

const PAGE_SIZE = 50;
export default async function AdminAuditPage({ searchParams }: { searchParams?: { page?: string; q?: string; status?: string } }) {
  await requireSuperAdmin();
  const page = parsePage(searchParams?.page); const q = searchParams?.q?.trim() ?? ""; const targetType = searchParams?.status?.trim() ?? "";
  const where = { ...(targetType ? { targetType } : {}), ...(q ? { OR: [{ summary: { contains: q, mode: "insensitive" as const } }, { action: { contains: q, mode: "insensitive" as const } }, { actor: { email: { contains: q, mode: "insensitive" as const } } }] } : {}) };
  const [entries, total] = await Promise.all([prisma.platformAuditLog.findMany({ where, include: { actor: { select: { email: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }), prisma.platformAuditLog.count({ where })]);
  return <div className="w-full min-w-0"><PageHeader title="Audit log" description="Jejak perubahan sensitif di tingkat platform." /><AdminFilterBar action="/admin/audit" query={q} status={targetType} statusLabel="Target" options={[{ value: "user", label: "User" }, { value: "workspace", label: "Workspace" }, { value: "subscription", label: "Subscription" }, { value: "invoice", label: "Invoice" }, { value: "template", label: "Template" }, { value: "report", label: "Report" }, { value: "error", label: "Error" }]} /><Card><CardContent className="divide-y p-0">{entries.map((entry) => <div key={entry.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr_220px]"><div><p className="text-xs font-medium uppercase text-zinc-500">{entry.action}</p><p className="text-xs text-zinc-400">{entry.targetType}</p></div><p className="text-sm">{entry.summary}</p><p className="text-xs text-zinc-500 sm:text-right">{entry.actor?.email ?? "System"}<br />{formatDate(entry.createdAt)}</p></div>)}{!entries.length ? <p className="p-6 text-sm text-zinc-500">Belum ada aktivitas yang cocok.</p> : null}<Pagination page={page} total={total} pageSize={PAGE_SIZE} basePath="/admin/audit" params={{ q: q || undefined, status: targetType || undefined }} /></CardContent></Card></div>;
}
