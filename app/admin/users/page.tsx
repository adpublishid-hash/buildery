import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";
import { ROLE_LABEL } from "@/lib/permissions";
import { resolveSystemRole, isSuperAdminEmail } from "@/lib/super-admin";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { UserRowActions } from "@/components/admin/user-row-actions";
import { formatDate, getInitials } from "@/lib/utils";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import Link from "next/link";
import type { Prisma, Role } from "@prisma/client";

export const metadata = { title: "Users · Admin" };

const PAGE_SIZE = 50;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: { page?: string; q?: string; status?: string; sort?: string };
}) {
  const admin = await requireSuperAdmin();
  const page = parsePage(searchParams?.page);
  const q = searchParams?.q?.trim() ?? "";
  const role = (["SUPER_ADMIN", "OWNER", "STAFF", "CUSTOMER", "AFFILIATE"] as Role[]).includes(searchParams?.status as Role) ? searchParams?.status as Role : undefined;
  const sort = searchParams?.sort === "oldest" || searchParams?.sort === "name" ? searchParams.sort : "newest";
  const where: Prisma.UserWhereInput = {
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
    ...(role ? { role } : {}),
  };

  const [totalUsers, users, plans] = await Promise.all([prisma.user.count({ where }), prisma.user.findMany({
    where,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      _count: { select: { createdWorkspaces: true } },
      subscription: {
        include: { plan: { select: { name: true, tier: true } } },
      },
    },
    orderBy: sort === "name" ? { name: "asc" } : { createdAt: sort === "oldest" ? "asc" : "desc" },
  }), prisma.saaSPlan.findMany({
    where: { isPublic: true, tier: { not: "BUSINESS" } },
    select: { id: true, name: true, tier: true, monthlyPrice: true },
    orderBy: { sortOrder: "asc" },
  })]);

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Users"
        description={`${totalUsers} accounts across the platform.`}
      />

      <AdminFilterBar action="/admin/users" query={q} status={role} statusLabel="Role" options={Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))} extra={<select name="sort" defaultValue={sort} aria-label="Urutan" className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm"><option value="newest">Terbaru</option><option value="oldest">Terlama</option><option value="name">Nama A-Z</option></select>} />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Workspaces</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-12 pr-4 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const isPlatformSuperAdmin = isSuperAdminEmail(user.email);
                const effectiveRole = resolveSystemRole(user.email, user.role);
                const hasIgnoredSuperAdminRole =
                  user.role === "SUPER_ADMIN" && !isPlatformSuperAdmin;

                return (
                  <TableRow key={user.id}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          {user.image ? (
                            <AvatarImage src={user.image} alt="" />
                          ) : null}
                          <AvatarFallback>
                            {getInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <Link href={`/admin/users/${user.id}`} className="block truncate text-sm font-medium text-zinc-900 hover:underline">
                            {user.name ?? user.email}
                            {user.id === admin.id ? (
                              <span className="ml-1.5 text-xs font-normal text-zinc-400">
                                (you)
                              </span>
                            ) : null}
                          </Link>
                          <p className="truncate text-xs text-zinc-500">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            effectiveRole === "SUPER_ADMIN"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {ROLE_LABEL[effectiveRole]}
                        </Badge>
                        {hasIgnoredSuperAdminRole ? (
                          <Badge variant="outline">DB role ignored</Badge>
                        ) : null}
                        {user.deletedAt ? <Badge variant="destructive">Karantina</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-zinc-500">
                      {user.subscription?.plan.name ?? "Free"}
                    </TableCell>
                    <TableCell className="text-sm text-zinc-500">
                      {user._count.createdWorkspaces}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {formatDate(user.createdAt)}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <UserRowActions
                        userId={user.id}
                        userEmail={user.email}
                        role={user.role}
                        isSelf={user.id === admin.id}
                        isPlatformSuperAdmin={isPlatformSuperAdmin}
                        currentPlanTier={user.subscription?.plan.tier ?? "FREE"}
                        plans={plans}
                        isQuarantined={Boolean(user.deletedAt)}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination page={page} total={totalUsers} pageSize={PAGE_SIZE} basePath="/admin/users" params={{ q: q || undefined, status: role, sort: sort === "newest" ? undefined : sort }} />
        </CardContent>
      </Card>
    </div>
  );
}
