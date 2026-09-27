import "server-only";

import type { Workspace } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { publicSiteUrl } from "@/lib/public-url";

/**
 * A sitemap per storefront.
 *
 * Products, posts and published pages were only discoverable if something
 * happened to link to them — a platform that sells SEO-driven shops shipped no
 * sitemap and no robots.txt at all.
 */

/** Google ignores anything past 50k URLs; stores are nowhere near that. */
const MAX_URLS = 5_000;

export type SitemapEntry = {
  loc: string;
  lastModified: Date | null;
  changefreq: "daily" | "weekly" | "monthly";
  priority: string;
};

export async function buildStoreSitemap(
  workspace: Pick<Workspace, "id" | "slug">
): Promise<SitemapEntry[]> {
  const [products, posts, pages] = await Promise.all([
    prisma.product.findMany({
      where: { workspaceId: workspace.id, status: "ACTIVE" },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: MAX_URLS,
    }),
    prisma.blogPost.findMany({
      where: {
        workspaceId: workspace.id,
        status: { in: ["PUBLISHED", "SCHEDULED"] },
        publishedVersion: { not: null },
        publishedSlug: { not: null },
      },
      select: { publishedSlug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 1_000,
    }),
    prisma.page.findMany({
      where: {
        status: "PUBLISHED",
        website: { workspaceId: workspace.id },
      },
      select: { id: true, slug: true, updatedAt: true, website: { select: { homePageId: true } } },
      orderBy: { updatedAt: "desc" },
      take: 1_000,
    }),
  ]);

  const entries: SitemapEntry[] = [
    {
      loc: publicSiteUrl(workspace.slug, ""),
      lastModified: null,
      changefreq: "daily",
      priority: "1.0",
    },
    {
      loc: publicSiteUrl(workspace.slug, "products"),
      lastModified: products[0]?.updatedAt ?? null,
      changefreq: "daily",
      priority: "0.9",
    },
  ];

  for (const product of products) {
    entries.push({
      loc: publicSiteUrl(workspace.slug, `products/${product.slug}`),
      lastModified: product.updatedAt,
      changefreq: "weekly",
      priority: "0.8",
    });
  }
  if (posts.length) {
    entries.push(
      {
        loc: publicSiteUrl(workspace.slug, "blog"),
        lastModified: posts[0]?.updatedAt ?? null,
        changefreq: "daily",
        priority: "0.7",
      },
      {
        loc: publicSiteUrl(workspace.slug, "blog/feed.xml"),
        lastModified: posts[0]?.updatedAt ?? null,
        changefreq: "daily",
        priority: "0.4",
      }
    );
  }
  for (const post of posts) {
    if (!post.publishedSlug) continue;
    entries.push({
      loc: publicSiteUrl(workspace.slug, `blog/${post.publishedSlug}`),
      lastModified: post.updatedAt,
      changefreq: "monthly",
      priority: "0.6",
    });
  }
  for (const page of pages) {
    // The homepage is already the first entry.
    if (page.website.homePageId === page.id) continue;
    entries.push({
      loc: publicSiteUrl(workspace.slug, page.slug),
      lastModified: page.updatedAt,
      changefreq: "monthly",
      priority: "0.5",
    });
  }

  return entries.slice(0, MAX_URLS);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderSitemapXml(entries: SitemapEntry[]) {
  const urls = entries
    .map((entry) =>
      [
        "  <url>",
        `    <loc>${escapeXml(entry.loc)}</loc>`,
        entry.lastModified
          ? `    <lastmod>${entry.lastModified.toISOString().slice(0, 10)}</lastmod>`
          : null,
        `    <changefreq>${entry.changefreq}</changefreq>`,
        `    <priority>${entry.priority}</priority>`,
        "  </url>",
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/**
 * Checkout, cart and member pages are private to one shopper and must never be
 * indexed; the sitemap is advertised so crawlers find the rest.
 */
export function renderStoreRobotsTxt(workspaceSlug: string) {
  return [
    "User-agent: *",
    "Disallow: /cart",
    "Disallow: /checkout",
    "Disallow: /member",
    "Allow: /",
    "",
    `Sitemap: ${publicSiteUrl(workspaceSlug, "sitemap.xml")}`,
    "",
  ].join("\n");
}
