import "server-only";

import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { revalidateTag, unstable_cache } from "next/cache";
import type { Metadata } from "next";
import type { PageStatus, Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseBlockDataWithReport, type Block } from "@/lib/blocks/schema";
import { reportError } from "@/lib/error-reporting";
import { applySiteChrome, parseSiteChrome } from "@/lib/site-chrome";
import { protectWhatsappPlaceholders } from "@/lib/template-personalize";
import { resolveIntegratedBlocks } from "@/lib/blocks/integrations";
import { catalogTag } from "@/lib/storefront-catalog";
import { findSlugRedirect } from "@/lib/page-slugs";
import { publicSiteContextHref } from "@/lib/public-url-server";

/**
 * Only what the public page and its metadata actually read.
 *
 * Deliberately plain and free of Dates: this is served from a tag-invalidated
 * cache, and `unstable_cache` round-trips through JSON — a cached Prisma model
 * hands back strings where the type promises a Date.
 */
export type ResolvedPublicPage = {
  workspace: {
    id: string;
    name: string;
    slug: string;
    primaryColor: string;
  };
  website: { id: string; designTokens: Prisma.JsonValue; homePageId: string | null };
  /**
   * Halaman ini yang tampil di akar situs.
   *
   * Tidak bisa disimpulkan dari `homePageId`: kolom itu boleh kosong, dan
   * sebagian besar situs memang membiarkannya kosong lalu jatuh ke slug
   * "home" atau halaman terbit pertama. Hanya resolver yang tahu jalur mana
   * yang benar-benar dipakai.
   */
  isHomePage: boolean;
  page: {
    id: string;
    title: string;
    slug: string;
    status: PageStatus;
    seoTitle: string | null;
    metaDescription: string | null;
    ogImage: string | null;
    canonicalUrl: string | null;
    noindex: boolean;
    /** Meta standard event the browser pixels fire when the page is viewed. */
    pixelEvent: string | null;
    customCss: string | null;
  };
  blocks: Block[];
};

/** Dropped whenever anything on a page, or the catalogue it embeds, changes. */
export function pageCacheTag(workspaceId: string) {
  return `page:${workspaceId}`;
}

export function revalidatePublicPages(workspaceId: string) {
  try {
    revalidateTag(pageCacheTag(workspaceId));
  } catch {
    // Outside a request scope (a job, a test): nothing to invalidate.
  }
}

/** A published page is the same for everyone; only an edit changes it. */
const PAGE_CACHE_TTL_SECONDS = 300;

function toBlocks(raw: { id: string; type: Block["type"]; data: unknown }[]) {
  return raw.map((b) => {
    const parsed = parseBlockDataWithReport(b.type, b.data);
    if (parsed.repaired.length > 0) {
      // Isi yang tidak valid di data tersimpan dulu hilang tanpa jejak. Sekarang
      // hanya bagian itu yang dikembalikan ke default, dan kejadiannya dicatat
      // supaya bisa ditelusuri dari /admin/errors.
      reportError("stored block data repaired", new Error(`${b.type} ${b.id}`), {
        context: { blockId: b.id, type: b.type, repaired: parsed.repaired },
        fingerprintExtra: `${b.type}:${parsed.repaired.join(",")}`,
      });
    }
    return { id: b.id, type: b.type, data: parsed.data } as Block;
  });
}

/**
 * Resolves a public page by workspace slug and (optional) page slug.
 *
 * - With `pageSlug`: returns that exact page (any status — the caller
 *   decides whether a non-published page may be shown).
 * - Without `pageSlug`: returns the selected homepage, then the "home" page,
 *   then the first published page of the website.
 *
 * Wrapped in React `cache` so `generateMetadata` and the page render share
 * a single database read per request. Returns `null` when nothing matches.
 */
const workspaceSelect = {
  id: true,
  name: true,
  slug: true,
  primaryColor: true,
} as const;

const pageSelect = {
  id: true,
  title: true,
  slug: true,
  status: true,
  seoTitle: true,
  metaDescription: true,
  ogImage: true,
  canonicalUrl: true,
  noindex: true,
  pixelEvent: true,
  customCss: true,
} as const;

/**
 * Resolves a public page by workspace slug and (optional) page slug.
 *
 * - With `pageSlug`: returns that exact page (any status — the caller
 *   decides whether a non-published page may be shown).
 * - Without `pageSlug`: returns the selected homepage, then the "home" page,
 *   then the first published page of the website.
 *
 * Two layers of caching. React `cache` makes `generateMetadata` and the render
 * share one read per request; `unstable_cache` makes every visitor after the
 * first share one read altogether — a landing page is identical for all of
 * them, and used to cost three queries plus one per embedded product, course
 * or form on every single hit. An edit drops the tag.
 */
export const resolvePublicPage = cache(
  async (
    workspaceSlug: string,
    pageSlug?: string
  ): Promise<ResolvedPublicPage | null> => {
    const workspace = await prisma.workspace.findFirst({
      where: { slug: workspaceSlug, status: "ACTIVE" },
      select: workspaceSelect,
    });
    if (!workspace) return null;

    // Tagged by workspace id, which is why the lookup above stays outside:
    // the tag has to be known before the cached call is made.
    return unstable_cache(
      async () => loadPublicPage(workspace, pageSlug),
      // Versi ikut jadi bagian kunci. Tanpa itu, entri yang ditulis sebelum
      // bentuk ResolvedPublicPage berubah akan tetap dibaca setelah deploy,
      // dengan field baru berisi undefined — halaman depan akan terus menandai
      // dirinya sebagai halaman biasa sampai cache-nya kedaluwarsa sendiri.
      // Naikkan angkanya setiap kali bentuk payload ini berubah.
      ["public-page", "v5", workspace.id, pageSlug ?? "__home__"],
      {
        tags: [pageCacheTag(workspace.id), catalogTag(workspace.id)],
        revalidate: PAGE_CACHE_TTL_SECONDS,
      }
    )();
  }
);

async function loadPublicPage(
  workspace: ResolvedPublicPage["workspace"],
  pageSlug?: string
): Promise<ResolvedPublicPage | null> {
  const website = await prisma.website.findFirst({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      designTokens: true,
      homePageId: true,
      siteHeader: true,
      siteFooter: true,
    },
  });
  if (!website) return null;

  const include = {
    ...pageSelect,
    blocks: {
      orderBy: { order: "asc" as const },
      select: { id: true, type: true, data: true },
    },
  };

  let page = null as
    | (ResolvedPublicPage["page"] & {
        blocks: { id: string; type: Block["type"]; data: unknown }[];
      })
    | null;

  if (pageSlug) {
    page = await prisma.page.findUnique({
      where: { websiteId_slug: { websiteId: website.id, slug: pageSlug } },
      select: include,
    });
  } else {
    if (website.homePageId) {
      page = await prisma.page.findFirst({
        where: { id: website.homePageId, websiteId: website.id },
        select: include,
      });
    }
    if (!page) {
      page = await prisma.page.findUnique({
        where: { websiteId_slug: { websiteId: website.id, slug: "home" } },
        select: include,
      });
    }
    if (!page) {
      page = await prisma.page.findFirst({
        where: { websiteId: website.id, status: "PUBLISHED" },
        orderBy: { createdAt: "asc" },
        select: include,
      });
    }
  }

  if (!page) return null;

  const integration = await prisma.integrationSetting.findUnique({
    where: { workspaceId: workspace.id },
    select: { whatsappSenderNumber: true },
  });

  const { blocks, ...pageFields } = page;
  return {
    workspace,
    // Dipanggil tanpa slug berarti ini permintaan akar situs.
    isHomePage: !pageSlug,
    website: {
      id: website.id,
      designTokens: website.designTokens,
      homePageId: website.homePageId,
    },
    page: pageFields,
    // Header/footer situs diterapkan sebelum integrasi, supaya yang tayang
    // selalu versi bersama, bukan salinan lama yang tersimpan di halaman ini.
    // Lalu nomor WhatsApp contoh diamankan: halaman yang terbit sebelum
    // penjaga penerbitan ada tidak boleh terus mengarahkan chat pembeli ke
    // nomor yang bisa saja milik orang lain.
    blocks: await resolveIntegratedBlocks(
      protectWhatsappPlaceholders(
        applySiteChrome(toBlocks(blocks), parseSiteChrome(website)),
        integration?.whatsappSenderNumber
      ).blocks,
      workspace
    ),
  };
}

/** True when `userId` is a member of the workspace (used for preview mode). */
export async function isWorkspaceMember(workspaceId: string, userId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { id: true },
  });
  return Boolean(membership);
}

/**
 * Resolves a page for public viewing and enforces visibility:
 *
 * - Published pages are visible to everyone.
 * - Non-published pages are visible only to workspace members, in which
 *   case `isPreview` is `true`.
 * - Anything else triggers `notFound()`.
 */
export async function loadViewablePage(
  workspaceSlug: string,
  pageSlug?: string
): Promise<{ resolved: ResolvedPublicPage; isPreview: boolean }> {
  const resolved = await resolvePublicPage(workspaceSlug, pageSlug);
  if (!resolved) {
    // The page may simply have been renamed; an old address is worth a
    // redirect rather than a 404 for every link already pointing at it.
    const moved = pageSlug
      ? await resolveRenamedPage(workspaceSlug, pageSlug)
      : null;
    if (moved) redirect(publicSiteContextHref(workspaceSlug, moved));
    notFound();
  }

  if (resolved.page.status === "PUBLISHED") {
    return { resolved, isPreview: false };
  }

  const session = await auth();
  const allowed =
    session?.user &&
    (await isWorkspaceMember(resolved.workspace.id, session.user.id));
  if (!allowed) notFound();

  return { resolved, isPreview: true };
}

/** Builds Next.js metadata from a resolved page. */
export function publicPageMetadata(
  resolved: ResolvedPublicPage | null
): Metadata {
  if (!resolved) {
    return { title: "Page not found" };
  }
  const { page, workspace } = resolved;
  const title = page.seoTitle?.trim() || page.title;
  const description = page.metaDescription?.trim() || undefined;

  return {
    // `absolute` so the published site doesn't inherit the "· My Landing"
    // title template from the root layout.
    title: { absolute: `${title} · ${workspace.name}` },
    description,
    openGraph: {
      title,
      description,
      siteName: workspace.name,
      images: page.ogImage ? [{ url: page.ogImage }] : undefined,
    },
    alternates: page.canonicalUrl?.trim()
      ? { canonical: page.canonicalUrl.trim() }
      : undefined,
    // A draft is never indexable; a published page can still be held back on
    // purpose, e.g. a thank-you page that should not show up in search.
    robots:
      page.status === "PUBLISHED" && !page.noindex
        ? undefined
        : { index: false, follow: false },
  };
}

/**
 * The address a renamed page moved to, if this one used to be it.
 *
 * Kept off the cached path on purpose: it only runs when a lookup already
 * missed, which is rare, and a stale redirect is worse than an extra query.
 */
async function resolveRenamedPage(
  workspaceSlug: string,
  pageSlug: string
): Promise<string | null> {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: workspaceSlug, status: "ACTIVE" },
    select: { id: true },
  });
  if (!workspace) return null;

  const website = await prisma.website.findFirst({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!website) return null;

  return findSlugRedirect({ websiteId: website.id, slug: pageSlug });
}
