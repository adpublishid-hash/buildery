import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock3, ShieldCheck, Users } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashWorkspaceInvitationToken } from "@/lib/workspace-invitations";
import { MEMBER_ROLE_LABEL } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InvitationDecision } from "@/components/workspaces/invitation-decision";

export const dynamic = "force-dynamic";

export default async function WorkspaceInvitationPage({ params }: { params: { token: string } }) {
  const invitation = await prisma.workspaceInvitation.findUnique({
    where: { token: hashWorkspaceInvitationToken(params.token) },
    include: { workspace: { select: { name: true, logoUrl: true, status: true } }, invitedBy: { select: { name: true, email: true } } },
  });
  if (!invitation) notFound();
  const session = await auth();
  const expired = invitation.expiresAt <= new Date() || invitation.status === "EXPIRED";
  const usable = invitation.status === "PENDING" && !expired && invitation.workspace.status === "ACTIVE";
  const correctAccount = session?.user.email?.toLowerCase().trim() === invitation.email;

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10 dark:bg-zinc-950">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"><Users className="h-5 w-5" /></div>
          <CardTitle>Undangan ke {invitation.workspace.name}</CardTitle>
          <CardDescription>{invitation.invitedBy?.name ?? invitation.invitedBy?.email ?? "Admin workspace"} mengundang {invitation.email} sebagai {MEMBER_ROLE_LABEL[invitation.role]}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-2 text-sm text-zinc-500"><Clock3 className="h-4 w-4" /> Berlaku sampai {invitation.expiresAt.toLocaleDateString("id-ID")}</div>
          {!usable ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Undangan ini sudah tidak aktif, kedaluwarsa, atau telah digunakan.</p> : !session?.user ? <div className="flex flex-wrap gap-2"><Button asChild><Link href={`/login?callbackUrl=${encodeURIComponent(`/invite/${params.token}`)}`}><ShieldCheck /> Masuk</Link></Button><Button asChild variant="outline"><Link href={`/register?email=${encodeURIComponent(invitation.email)}&callbackUrl=${encodeURIComponent(`/invite/${params.token}`)}`}>Buat akun</Link></Button></div> : !correctAccount ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Masuk menggunakan akun {invitation.email} untuk merespons undangan ini.</p> : <InvitationDecision token={params.token} />}
        </CardContent>
      </Card>
    </main>
  );
}
