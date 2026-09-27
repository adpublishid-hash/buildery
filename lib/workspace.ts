import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { MemberRole, Workspace } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  canInWorkspace,
  type WorkspacePermission,
} from "@/lib/permissions";

export const CURRENT_WORKSPACE_COOKIE = "buildery_workspace";

export type WorkspaceMembership = {
  workspace: Workspace;
  role: MemberRole;
  isFavorite: boolean;
  lastOpenedAt: Date | null;
};

/** All workspaces the current user is a member of, most recently active first. */
export async function listMyWorkspaces(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId, workspace: { status: { not: "PENDING_DELETION" } } },
    include: { workspace: true },
    orderBy: [{ isFavorite: "desc" }, { lastOpenedAt: "desc" }, { createdAt: "desc" }],
  });

  return memberships.map((m) => ({
    workspace: m.workspace,
    role: m.role,
    isFavorite: m.isFavorite,
    lastOpenedAt: m.lastOpenedAt,
  })) satisfies WorkspaceMembership[];
}

/**
 * Reads the current workspace from cookie. Validates the user is still a
 * member; if the cookie is stale or empty, falls back to the most recent
 * membership. Returns `null` when the user has no workspaces yet.
 */
export async function getCurrentWorkspace(userId: string) {
  const cookieId = cookies().get(CURRENT_WORKSPACE_COOKIE)?.value;

  if (cookieId) {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: cookieId, userId } },
      include: { workspace: true },
    });
    if (membership?.workspace.status === "ACTIVE") {
      return { workspace: membership.workspace, role: membership.role };
    }
  }

  const fallback = await prisma.workspaceMember.findFirst({
    where: { userId, workspace: { status: "ACTIVE" } },
    include: { workspace: true },
    orderBy: [{ lastOpenedAt: "desc" }, { createdAt: "desc" }],
  });

  if (!fallback) return null;
  return { workspace: fallback.workspace, role: fallback.role };
}

/**
 * Requires a valid session and a current workspace. Redirects to /login or
 * /dashboard/workspaces/new when the prerequisites aren't met.
 */
export async function requireCurrentWorkspace() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const current = await getCurrentWorkspace(session.user.id);
  if (!current) redirect("/dashboard/workspaces/new");

  return {
    user: session.user,
    workspace: current.workspace,
    role: current.role,
  };
}

/**
 * Like `requireCurrentWorkspace` but also enforces a workspace permission.
 * Redirects to the workspace home when the user lacks the permission.
 */
export async function requireWorkspacePermission(
  permission: WorkspacePermission
) {
  const ctx = await requireCurrentWorkspace();
  if (!canInWorkspace(ctx.role, permission)) {
    redirect("/dashboard");
  }
  return ctx;
}

/**
 * Workspace data limited to the rows the caller is allowed to see. For now
 * this is just a thin wrapper that asserts membership; later parts can layer
 * on resource-scoped filters.
 */
export async function assertMembership(workspaceId: string, userId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!membership) {
    throw new Error("You don't have access to this workspace.");
  }
  return membership;
}
