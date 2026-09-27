import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * A page's old addresses.
 *
 * Renaming a page used to 404 every link already pointing at it. The old slug
 * is remembered and redirects to the new one, permanently, so search engines
 * move their ranking across rather than dropping the page.
 */

type Db = Prisma.TransactionClient | PrismaClient;

/**
 * Records that `previousSlug` used to belong to this page.
 *
 * Also clears the new slug out of the history table: an address that is live
 * again must resolve to the page, not redirect somewhere else. And a page can
 * be renamed back, so its own stale entry is dropped too.
 */
export async function rememberPageSlug(
  db: Db,
  input: {
    websiteId: string;
    pageId: string;
    previousSlug: string;
    nextSlug: string;
  }
): Promise<void> {
  if (!input.previousSlug || input.previousSlug === input.nextSlug) return;

  try {
    await db.pageSlugHistory.deleteMany({
      where: { websiteId: input.websiteId, slug: input.nextSlug },
    });
    await db.pageSlugHistory.upsert({
      where: {
        websiteId_slug: {
          websiteId: input.websiteId,
          slug: input.previousSlug,
        },
      },
      // Another page may have owned this address before; the latest rename wins.
      update: { pageId: input.pageId },
      create: {
        websiteId: input.websiteId,
        pageId: input.pageId,
        slug: input.previousSlug,
      },
    });
  } catch {
    // A missing redirect is a 404 on an old link, not a failed save.
  }
}

/**
 * The slug a retired address should redirect to, or null.
 *
 * Only published pages redirect: pointing a visitor at a draft would send them
 * to a 404 anyway, one hop later.
 */
export async function findSlugRedirect(input: {
  websiteId: string;
  slug: string;
}): Promise<string | null> {
  const record = await prisma.pageSlugHistory.findUnique({
    where: { websiteId_slug: { websiteId: input.websiteId, slug: input.slug } },
    select: { page: { select: { slug: true, status: true } } },
  });
  if (!record || record.page.status !== "PUBLISHED") return null;
  if (record.page.slug === input.slug) return null;
  return record.page.slug;
}
