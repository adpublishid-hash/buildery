import "server-only";

import { prisma } from "@/lib/prisma";
import type { StorefrontPageKey } from "@/lib/storefront-content";

/** Fetch the stored override map for a storefront page (or null). */
export async function getPageContent(
  workspaceId: string,
  pageKey: StorefrontPageKey
): Promise<Record<string, unknown> | null> {
  const row = await prisma.storefrontPageContent.findUnique({
    where: { workspaceId_pageKey: { workspaceId, pageKey } },
  });
  return (row?.content as Record<string, unknown> | undefined) ?? null;
}
