import Link from "next/link";
import { Clock3, Settings, ShieldCheck, UserCheck, Users } from "lucide-react";

import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InvitationRowActions } from "@/components/workspaces/invitation-row-actions";
import { InviteMemberDialog } from "@/components/workspaces/invite-member-dialog";
import { MemberRowActions } from "@/components/workspaces/member-row-actions";
import {
  assignableMemberRoles,
  canInWorkspace,
  MEMBER_ROLE_LABEL,
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatDate, getInitials } from "@/lib/utils";
import { requireWorkspacePermission } from "@/lib/workspace";

export const metadata = { title: "Pengguna · My Landing" };

export default async function UsersPage() {
  const { workspace, role, user } = await requireWorkspacePermission("members.view");
  const canManageMembers = canInWorkspace(role, "members.manage");
  const canInvite = canInWorkspace(role, "members.invite");
  const assignableRoles = assignableMemberRoles(role).filter(
    (memberRole) => memberRole !== "OWNER"
  ) as Array<"ADMIN" | "EDITOR" | "VIEWER">;

  const [members, invitations] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            emailVerified: true,
          },
        },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.workspaceInvitation.findMany({
      where: { workspaceId: workspace.id, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const now = new Date();
  const managerCount = members.filter(
    (member) => member.role === "OWNER" || member.role === "ADMIN"
  ).length;
  const activeInvitationCount = invitations.filter(
    (invitation) => invitation.expiresAt > now
  ).length;

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Pengguna"
        description={`Kelola pengguna, peran, dan undangan untuk workspace ${workspace.name}.`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/dashboard/settings?tab=anggota">
                <Settings /> Pengaturan anggota
              </Link>
            </Button>
            {canInvite && assignableRoles.length > 0 ? (
              <InviteMemberDialog
                workspaceId={workspace.id}
                assignableRoles={assignableRoles}
              />
            ) : null}
          </div>
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Pengguna aktif"
          value={members.length}
          delta="Memiliki akses workspace"
          icon={Users}
        />
        <StatCard
          label="Pengelola"
          value={managerCount}
          delta="Pemilik dan admin"
          icon={ShieldCheck}
        />
        <StatCard
          label="Undangan pending"
          value={activeInvitationCount}
          delta={
            invitations.length > activeInvitationCount
              ? `${invitations.length - activeInvitationCount} kedaluwarsa`
              : "Menunggu penerima bergabung"
          }
          icon={Clock3}
        />
      </section>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Anggota workspace</CardTitle>
          <CardDescription>
            Pengguna aktif beserta status akun dan tingkat aksesnya.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {members.length === 0 ? (
            <div className="px-6 pb-6">
              <EmptyState
                icon={Users}
                title="Belum ada pengguna"
                description="Undang anggota tim untuk mulai berkolaborasi di workspace ini."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Pengguna</TableHead>
                    <TableHead>Peran</TableHead>
                    <TableHead>Status akun</TableHead>
                    <TableHead>Bergabung</TableHead>
                    <TableHead className="w-12 pr-6 text-right">
                      <span className="sr-only">Tindakan</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => {
                    const isSelf = member.user.id === user.id;
                    const showActions =
                      canManageMembers && member.role !== "OWNER" && !isSelf;

                    return (
                      <TableRow key={member.id}>
                        <TableCell className="pl-6">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              {member.user.image ? (
                                <AvatarImage src={member.user.image} alt="" />
                              ) : null}
                              <AvatarFallback>
                                {getInitials(member.user.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                {member.user.name ?? member.user.email}
                                {isSelf ? (
                                  <span className="ml-1.5 text-xs font-normal text-zinc-400">
                                    (Anda)
                                  </span>
                                ) : null}
                              </p>
                              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                                {member.user.email}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              member.role === "OWNER" ? "default" : "secondary"
                            }
                          >
                            {MEMBER_ROLE_LABEL[member.role]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={member.user.emailVerified ? "success" : "outline"}
                          >
                            {member.user.emailVerified ? "Terverifikasi" : "Belum verifikasi"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                          {formatDate(member.createdAt)}
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          {showActions ? (
                            <MemberRowActions
                              workspaceId={workspace.id}
                              memberId={member.id}
                              memberName={member.user.name ?? member.user.email}
                              currentRole={member.role}
                              assignableRoles={assignableRoles}
                            />
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Undangan pending</CardTitle>
          <CardDescription>
            Undangan aktif maupun yang perlu dikirim ulang karena kedaluwarsa.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {invitations.length === 0 ? (
            <div className="px-6 pb-6">
              <EmptyState
                icon={UserCheck}
                title="Tidak ada undangan pending"
                description="Semua undangan sudah diterima atau belum ada pengguna yang diundang."
                className="py-10"
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Email</TableHead>
                    <TableHead>Peran</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Dikirim</TableHead>
                    <TableHead>Kedaluwarsa</TableHead>
                    <TableHead className="w-12 pr-6 text-right">
                      <span className="sr-only">Tindakan</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((invitation) => {
                    const expired = invitation.expiresAt <= now;
                    return (
                      <TableRow key={invitation.id}>
                        <TableCell className="pl-6 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                          {invitation.email}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {MEMBER_ROLE_LABEL[invitation.role]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={expired ? "destructive" : "success"}>
                            {expired ? "Kedaluwarsa" : "Terkirim"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                          {formatDate(invitation.createdAt)}
                        </TableCell>
                        <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                          {formatDate(invitation.expiresAt)}
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          {canManageMembers ? (
                            <InvitationRowActions
                              workspaceId={workspace.id}
                              invitationId={invitation.id}
                            />
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
