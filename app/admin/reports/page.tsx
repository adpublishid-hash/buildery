import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { ReportsManager } from "@/components/admin/reports-manager";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import type { AbuseReportStatus, Prisma } from "@prisma/client";

export const metadata = { title: "Reports · Admin" };

const PAGE_SIZE = 50;

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams?: { page?: string; q?: string; status?: string };
}) {
  await requireSuperAdmin();
  const page = parsePage(searchParams?.page);
  const q = searchParams?.q?.trim() ?? "";
  const status = (["OPEN", "RESOLVED", "DISMISSED"] as AbuseReportStatus[]).includes(searchParams?.status as AbuseReportStatus) ? searchParams?.status as AbuseReportStatus : undefined;
  const where: Prisma.AbuseReportWhereInput = { ...(status ? { status } : {}), ...(q ? { OR: [{ reason: { contains: q, mode: "insensitive" } }, { reporterEmail: { contains: q, mode: "insensitive" } }, { workspace: { name: { contains: q, mode: "insensitive" } } }] } : {}) };

  const [reports, totalReports] = await Promise.all([
    prisma.abuseReport.findMany({
      where,
      include: { workspace: { select: { name: true, slug: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.abuseReport.count({ where }),
  ]);

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Abuse reports"
        description="Spam and abuse complaints flagged for review."
      />
      <AdminFilterBar action="/admin/reports" query={q} status={status} options={[{ value: "OPEN", label: "Terbuka" }, { value: "RESOLVED", label: "Selesai" }, { value: "DISMISSED", label: "Diabaikan" }]} />
      <Card>
        <CardContent className="pt-6">
          <ReportsManager reports={reports} />
          <Pagination
            page={page}
            total={totalReports}
            pageSize={PAGE_SIZE}
            basePath="/admin/reports"
            params={{ q: q || undefined, status }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
