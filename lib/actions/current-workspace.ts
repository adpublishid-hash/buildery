"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CURRENT_WORKSPACE_COOKIE } from "@/lib/workspace";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365, // 1 year
};

export async function switchWorkspaceAction(workspaceId: string) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId, userId: session.user.id },
    },
    include: { workspace: { select: { status: true } } },
  });

  if (!membership) {
    return { error: "You're not a member of that workspace." };
  }
  if (membership.workspace.status !== "ACTIVE") {
    return { error: "Workspace ini sedang tidak aktif." };
  }

  cookies().set(CURRENT_WORKSPACE_COOKIE, workspaceId, COOKIE_OPTS);
  await prisma.workspaceMember.update({
    where: { id: membership.id },
    data: { lastOpenedAt: new Date() },
  });

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function toggleWorkspaceFavoriteAction(workspaceId: string) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!membership) return { error: "Workspace tidak ditemukan." };
  const updated = await prisma.workspaceMember.update({
    where: { id: membership.id },
    data: { isFavorite: !membership.isFavorite },
  });
  revalidatePath("/dashboard", "layout");
  return { ok: true, favorite: updated.isFavorite };
}

export async function clearCurrentWorkspaceAction() {
  cookies().delete(CURRENT_WORKSPACE_COOKIE);
  revalidatePath("/dashboard", "layout");
}
