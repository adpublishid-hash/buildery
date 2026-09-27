import "server-only";

import { redirect } from "next/navigation";
import { Prisma, type Page, type Website } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  canInWorkspace,
  type WorkspacePermission,
} from "@/lib/permissions";
import { slugify } from "@/lib/slug";

/**
 * Each workspace owns exactly one Website in this MVP. This finds it, or
 * creates it on first use, named after the workspace.
 */
export async function getOrCreateDefaultWebsite(
  workspaceId: string
): Promise<Website> {
  const existing = await prisma.website.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });

  try {
    return await prisma.website.create({
      data: {
        workspaceId,
        name: workspace.name,
        slug: slugify(workspace.slug || workspace.name) || "site",
        description: null,
      },
    });
  } catch (error) {
    // Two first requests (a page and its prefetch, say) can both miss the
    // lookup above. The slug is deterministic, so the loser hits the unique
    // constraint; the website it wanted now exists.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const created = await prisma.website.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: "asc" },
      });
      if (created) return created;
    }
    throw error;
  }
}

/**
 * Loads a page and its workspace, verifies the signed-in user is a member,
 * and (optionally) enforces a workspace permission. Redirects on failure.
 */
export async function requirePageAccess(
  pageId: string,
  permission: WorkspacePermission = "content.view"
) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: {
      website: { include: { workspace: true } },
      blocks: { orderBy: { order: "asc" } },
    },
  });
  if (!page) redirect("/dashboard/pages");

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: page.website.workspaceId,
        userId: session.user.id,
      },
    },
  });
  if (!membership) redirect("/dashboard/pages");

  if (!canInWorkspace(membership.role, permission)) {
    redirect(`/dashboard/pages`);
  }

  return {
    user: session.user,
    page,
    website: page.website,
    workspace: page.website.workspace,
    role: membership.role,
  };
}

export type PageSummary = Pick<
  Page,
  "id" | "title" | "slug" | "status" | "updatedAt" | "publishedAt"
> & { blockCount: number };
