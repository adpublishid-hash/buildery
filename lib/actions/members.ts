"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { MemberRole } from "@prisma/client";

import { sendAppEmail } from "@/lib/app-email";
import { workspaceInvitationEmail } from "@/lib/app-email-templates";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  assignableMemberRoles,
  canInWorkspace,
  canManageMember,
  MEMBER_ROLE_LABEL,
} from "@/lib/permissions";
import { inviteMemberSchema, updateMemberRoleSchema } from "@/lib/zod";
import { reportError } from "@/lib/error-reporting";
import { assertCanCreate, getUserPlan } from "@/lib/saas-limits";
import { CURRENT_WORKSPACE_COOKIE } from "@/lib/workspace";
import {
  createWorkspaceInvitationToken,
  hashWorkspaceInvitationToken,
} from "@/lib/workspace-invitations";
import { writeWorkspaceAudit } from "@/lib/workspace-audit";

type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function revalidateSettings() {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/users");
}

async function ensureCallerCanManage(workspaceId: string, userId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { workspace: { select: { status: true } } },
  });
  if (!membership || membership.workspace.status !== "ACTIVE") return null;
  return canInWorkspace(membership.role, "members.manage") ? membership : null;
}

async function seatLimitError(workspaceId: string, excludeInvitationId?: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { createdById: true },
  });
  if (!workspace) return "Workspace tidak ditemukan.";
  const plan = await getUserPlan(workspace.createdById);
  if (plan.memberLimit == null) return null;
  const [members, pending] = await Promise.all([
    prisma.workspaceMember.count({ where: { workspaceId } }),
    prisma.workspaceInvitation.count({ where: { workspaceId, status: "PENDING", expiresAt: { gt: new Date() }, ...(excludeInvitationId ? { id: { not: excludeInvitationId } } : {}) } }),
  ]);
  return members + pending >= plan.memberLimit
    ? `Paket ${plan.name} mendukung maksimal ${plan.memberLimit} anggota termasuk undangan pending.`
    : null;
}

export async function inviteMemberAction(workspaceId: string, formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const caller = await ensureCallerCanManage(workspaceId, session.user.id);
  if (!caller) return { ok: false, error: "Tidak diizinkan." };

  const parsed = inviteMemberSchema.safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!parsed.success) return { ok: false, error: "Periksa kembali form.", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  if (!assignableMemberRoles(caller.role).includes(parsed.data.role)) return { ok: false, error: "Anda tidak dapat memberikan peran tersebut." };

  const email = parsed.data.email.toLowerCase().trim();
  const existingInvitation = await prisma.workspaceInvitation.findUnique({ where: { workspaceId_email: { workspaceId, email } }, select: { id: true, status: true } });
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing && await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: existing.id } } })) {
    return { ok: false, error: "Pengguna tersebut sudah menjadi anggota.", fieldErrors: { email: ["Sudah menjadi anggota."] } };
  }
  const limitError = existingInvitation?.status === "PENDING" ? null : await seatLimitError(workspaceId);
  if (limitError) return { ok: false, error: limitError };

  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true } });
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const token = createWorkspaceInvitationToken();
  await prisma.$transaction(async (tx) => {
    await tx.workspaceInvitation.upsert({
      where: { workspaceId_email: { workspaceId, email } },
      update: { role: parsed.data.role, token: token.hash, invitedById: session.user.id, expiresAt, status: "PENDING", acceptedAt: null, declinedAt: null, revokedAt: null },
      create: { workspaceId, email, role: parsed.data.role, token: token.hash, invitedById: session.user.id, expiresAt },
    });
    await writeWorkspaceAudit(tx, { workspaceId, actorId: session.user.id, action: "member.invited", summary: `${email} diundang sebagai ${MEMBER_ROLE_LABEL[parsed.data.role]}`, targetType: "invitation", metadata: { email, role: parsed.data.role } });
  });
  await notifyWorkspaceInvite({ to: email, workspaceName: workspace.name, inviterName: session.user.name ?? session.user.email ?? "Admin", role: parsed.data.role, token: token.raw });
  revalidateSettings();
  return { ok: true };
}

export async function updateMemberRoleAction(workspaceId: string, formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const caller = await ensureCallerCanManage(workspaceId, session.user.id);
  if (!caller) return { ok: false, error: "Tidak diizinkan." };
  const parsed = updateMemberRoleSchema.safeParse({ memberId: formData.get("memberId"), role: formData.get("role") });
  if (!parsed.success) return { ok: false, error: "Input tidak valid." };
  const target = await prisma.workspaceMember.findUnique({ where: { id: parsed.data.memberId }, include: { user: { select: { email: true } } } });
  if (!target || target.workspaceId !== workspaceId) return { ok: false, error: "Anggota tidak ditemukan." };
  if (!canManageMember(caller.role, target.role) || !assignableMemberRoles(caller.role).includes(parsed.data.role)) return { ok: false, error: "Anda hanya dapat mengelola anggota dengan peran lebih rendah." };

  await prisma.$transaction(async (tx) => {
    await tx.workspaceMember.update({ where: { id: target.id }, data: { role: parsed.data.role as MemberRole } });
    await writeWorkspaceAudit(tx, { workspaceId, actorId: session.user.id, action: "member.role_changed", summary: `Peran ${target.user.email} diubah`, targetType: "member", targetId: target.id, metadata: { from: target.role, to: parsed.data.role } });
  });
  revalidateSettings();
  return { ok: true };
}

export async function removeMemberAction(workspaceId: string, memberId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const caller = await ensureCallerCanManage(workspaceId, session.user.id);
  if (!caller) return { ok: false, error: "Tidak diizinkan." };
  const target = await prisma.workspaceMember.findUnique({ where: { id: memberId }, include: { user: { select: { email: true } } } });
  if (!target || target.workspaceId !== workspaceId) return { ok: false, error: "Anggota tidak ditemukan." };
  if (!canManageMember(caller.role, target.role)) return { ok: false, error: "Anda hanya dapat menghapus anggota dengan peran lebih rendah." };
  await prisma.$transaction(async (tx) => {
    await tx.workspaceMember.delete({ where: { id: memberId } });
    await writeWorkspaceAudit(tx, { workspaceId, actorId: session.user.id, action: "member.removed", summary: `${target.user.email} dihapus dari workspace`, targetType: "member", targetId: memberId });
  });
  revalidateSettings();
  return { ok: true };
}

export async function revokeInvitationAction(workspaceId: string, invitationId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const caller = await ensureCallerCanManage(workspaceId, session.user.id);
  if (!caller) return { ok: false, error: "Tidak diizinkan." };
  const invitation = await prisma.workspaceInvitation.findUnique({ where: { id: invitationId } });
  if (!invitation || invitation.workspaceId !== workspaceId) return { ok: false, error: "Undangan tidak ditemukan." };
  await prisma.$transaction(async (tx) => {
    await tx.workspaceInvitation.update({ where: { id: invitationId }, data: { status: "REVOKED", revokedAt: new Date() } });
    await writeWorkspaceAudit(tx, { workspaceId, actorId: session.user.id, action: "invitation.revoked", summary: `Undangan ${invitation.email} dicabut`, targetType: "invitation", targetId: invitationId });
  });
  revalidateSettings();
  return { ok: true };
}

export async function resendInvitationAction(workspaceId: string, invitationId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const caller = await ensureCallerCanManage(workspaceId, session.user.id);
  if (!caller) return { ok: false, error: "Tidak diizinkan." };
  const invitation = await prisma.workspaceInvitation.findUnique({ where: { id: invitationId }, include: { workspace: { select: { name: true } } } });
  if (!invitation || invitation.workspaceId !== workspaceId) return { ok: false, error: "Undangan tidak ditemukan." };
  if (!assignableMemberRoles(caller.role).includes(invitation.role)) return { ok: false, error: "Anda tidak dapat mengirim ulang undangan ini." };
  const token = createWorkspaceInvitationToken();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  await prisma.workspaceInvitation.update({ where: { id: invitation.id }, data: { token: token.hash, status: "PENDING", expiresAt, invitedById: session.user.id, acceptedAt: null, declinedAt: null, revokedAt: null } });
  await notifyWorkspaceInvite({ to: invitation.email, workspaceName: invitation.workspace.name, inviterName: session.user.name ?? session.user.email ?? "Admin", role: invitation.role, token: token.raw });
  revalidateSettings();
  return { ok: true };
}

export async function acceptWorkspaceInvitationAction(rawToken: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=${encodeURIComponent(`/invite/${rawToken}`)}`);
  const invitation = await prisma.workspaceInvitation.findUnique({ where: { token: hashWorkspaceInvitationToken(rawToken) }, include: { workspace: { select: { name: true, status: true } } } });
  if (!invitation || invitation.status !== "PENDING") return { ok: false, error: "Undangan tidak valid atau sudah digunakan." };
  if (invitation.expiresAt <= new Date()) {
    await prisma.workspaceInvitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
    return { ok: false, error: "Undangan sudah kedaluwarsa." };
  }
  if (invitation.workspace.status !== "ACTIVE") return { ok: false, error: "Workspace sedang tidak aktif." };
  if (invitation.email !== session.user.email?.toLowerCase().trim()) return { ok: false, error: "Masuk dengan email penerima undangan." };
  const limitError = await seatLimitError(invitation.workspaceId, invitation.id);
  if (limitError) return { ok: false, error: limitError };
  await prisma.$transaction(async (tx) => {
    await tx.workspaceMember.upsert({ where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: session.user.id } }, update: {}, create: { workspaceId: invitation.workspaceId, userId: session.user.id, role: invitation.role, lastOpenedAt: new Date() } });
    await tx.workspaceInvitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
    await writeWorkspaceAudit(tx, { workspaceId: invitation.workspaceId, actorId: session.user.id, action: "invitation.accepted", summary: `${invitation.email} menerima undangan`, targetType: "invitation", targetId: invitation.id });
  });
  cookies().set(CURRENT_WORKSPACE_COOKIE, invitation.workspaceId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 31536000 });
  revalidateSettings();
  return { ok: true };
}

export async function declineWorkspaceInvitationAction(rawToken: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=${encodeURIComponent(`/invite/${rawToken}`)}`);
  const invitation = await prisma.workspaceInvitation.findUnique({ where: { token: hashWorkspaceInvitationToken(rawToken) } });
  if (!invitation || invitation.status !== "PENDING" || invitation.email !== session.user.email?.toLowerCase().trim()) return { ok: false, error: "Undangan tidak valid." };
  await prisma.workspaceInvitation.update({ where: { id: invitation.id }, data: { status: "DECLINED", declinedAt: new Date() } });
  return { ok: true };
}

export async function transferWorkspaceOwnershipAction(workspaceId: string, memberId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const caller = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: session.user.id } } });
  if (caller?.role !== "OWNER") return { ok: false, error: "Hanya pemilik yang dapat memindahkan kepemilikan." };
  const target = await prisma.workspaceMember.findUnique({ where: { id: memberId }, include: { user: { select: { email: true } } } });
  if (!target || target.workspaceId !== workspaceId || target.userId === session.user.id) return { ok: false, error: "Anggota tujuan tidak valid." };
  const ownerLimitError = await assertCanCreate(target.userId, "workspace");
  if (ownerLimitError) return { ok: false, error: `Pemilik baru belum dapat menerima workspace: ${ownerLimitError}` };
  const [targetPlan, ownedWorkspace] = await Promise.all([
    getUserPlan(target.userId),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { customDomain: true, _count: { select: { members: true } } } }),
  ]);
  if (ownedWorkspace?.customDomain && !targetPlan.customDomainEnabled) return { ok: false, error: "Paket pemilik baru belum mendukung custom domain workspace ini." };
  if (targetPlan.memberLimit != null && (ownedWorkspace?._count.members ?? 0) > targetPlan.memberLimit) return { ok: false, error: `Paket pemilik baru mendukung maksimal ${targetPlan.memberLimit} anggota.` };
  await prisma.$transaction(async (tx) => {
    await tx.workspaceMember.update({ where: { id: caller.id }, data: { role: "ADMIN" } });
    await tx.workspaceMember.update({ where: { id: target.id }, data: { role: "OWNER" } });
    await tx.workspace.update({ where: { id: workspaceId }, data: { createdById: target.userId } });
    await writeWorkspaceAudit(tx, { workspaceId, actorId: session.user.id, action: "workspace.ownership_transferred", summary: `Kepemilikan dipindahkan ke ${target.user.email}`, targetType: "member", targetId: target.id });
  });
  revalidateSettings();
  return { ok: true };
}

export async function leaveWorkspaceAction(workspaceId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const membership = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: session.user.id } } });
  if (!membership) return { ok: false, error: "Keanggotaan tidak ditemukan." };
  if (membership.role === "OWNER") return { ok: false, error: "Pindahkan kepemilikan sebelum keluar." };
  await prisma.$transaction(async (tx) => {
    await writeWorkspaceAudit(tx, { workspaceId, actorId: session.user.id, action: "member.left", summary: `${session.user.email} keluar dari workspace`, targetType: "member", targetId: membership.id });
    await tx.workspaceMember.delete({ where: { id: membership.id } });
  });
  if (cookies().get(CURRENT_WORKSPACE_COOKIE)?.value === workspaceId) cookies().delete(CURRENT_WORKSPACE_COOKIE);
  revalidateSettings();
  return { ok: true };
}

async function notifyWorkspaceInvite(input: { to: string; workspaceName: string; inviterName: string; role: MemberRole; token: string }) {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
  const actionUrl = `${baseUrl}/invite/${input.token}`;
  const content = workspaceInvitationEmail({ workspaceName: input.workspaceName, inviterName: input.inviterName, roleLabel: MEMBER_ROLE_LABEL[input.role], actionUrl, existingUser: false });
  const result = await sendAppEmail({ to: input.to, subject: content.subject, text: content.text, html: content.html });
  if (!result.ok) reportError("members invite email failed", result.error);
}
