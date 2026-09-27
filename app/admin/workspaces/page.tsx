import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/page-header";
import { WorkspaceDeleteButton } from "@/components/admin/workspace-delete-button";
import { WorkspaceStatusButton } from "@/components/admin/workspace-status-button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import Link from "next/link";
import type { Prisma, WorkspaceStatus } from "@prisma/client";

export const metadata = { title: "Workspaces · Admin" };

const PAGE_SIZE = 50;

export default async function AdminWorkspacesPage({
  searchParams,
}: {
  searchParams?: { page?: string; q?: string; status?: string; sort?: string };
}) {
  await requireSuperAdmin();
  const page = parsePage(searchParams?.page);
  const q = searchParams?.q?.trim() ?? "";
  const status = (["ACTIVE", "SUSPENDED", "PENDING_DELETION"] as WorkspaceStatus[]).includes(searchParams?.status as WorkspaceStatus) ? searchParams?.status as WorkspaceStatus : undefined;
  const sort = searchParams?.sort === "oldest" || searchParams?.sort === "name" ? searchParams.sort : "newest";
  const where: Prisma.WorkspaceWhereInput = { ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }, { createdBy: { email: { contains: q, mode: "insensitive" } } }] } : {}), ...(status ? { status } : {}) };

  const [totalWorkspaces, workspaces] = await Promise.all([prisma.workspace.count({ where }), prisma.workspace.findMany({
    where,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      createdBy: { select: { email: true } },
      _count: {
        select: { members: true, products: true, courses: true, websites: true },
      },
    },
    orderBy: sort === "name" ? { name: "asc" } : { createdAt: sort === "oldest" ? "asc" : "desc" },
  })]);

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Workspaces"
        description={`${totalWorkspaces} workspaces across the platform.`}
      />

      <AdminFilterBar action="/admin/workspaces" query={q} status={status} options={[{ value: "ACTIVE", label: "Aktif" }, { value: "SUSPENDED", label: "Ditangguhkan" }, { value: "PENDING_DELETION", label: "Karantina" }]} extra={<select name="sort" defaultValue={sort} aria-label="Urutan" className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm"><option value="newest">Terbaru</option><option value="oldest">Terlama</option><option value="name">Nama A-Z</option></select>} />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Workspace</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Products</TableHead>
                <TableHead>Courses</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12 pr-4 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspaces.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="pl-4">
                    <Link href={`/admin/workspaces/${w.id}`} className="block text-sm font-medium text-zinc-900 hover:underline">
                      {w.name}
                    </Link>
                    <p className="truncate text-xs text-zinc-500">/{w.slug}</p>
                  </TableCell>
                  <TableCell className="text-sm text-zinc-500">
                    {w.createdBy.email}
                  </TableCell>
                  <TableCell className="text-sm text-zinc-500">
                    {w._count.members}
                  </TableCell>
                  <TableCell className="text-sm text-zinc-500">
                    {w._count.products}
                  </TableCell>
                  <TableCell className="text-sm text-zinc-500">
                    {w._count.courses}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500">
                    {formatDate(w.createdAt)}
                  </TableCell>
                  <TableCell><Badge variant={w.status === "ACTIVE" ? "success" : "secondary"}>{w.status}</Badge></TableCell>
                  <TableCell className="pr-4 text-right">
                    <WorkspaceStatusButton workspaceId={w.id} status={w.status} />
                    <WorkspaceDeleteButton
                      workspaceId={w.id}
                      workspaceName={w.name}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            total={totalWorkspaces}
            pageSize={PAGE_SIZE}
            basePath="/admin/workspaces"
            params={{ q: q || undefined, status, sort: sort === "newest" ? undefined : sort }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
