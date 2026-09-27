import "server-only";

import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function loadEditableBuilderPage(pageId: string, userId: string) {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: { website: true },
  });
  if (!page) return null;

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: page.website.workspaceId,
        userId,
      },
    },
  });

  return membership && canInWorkspace(membership.role, "content.edit")
    ? page
    : null;
}
