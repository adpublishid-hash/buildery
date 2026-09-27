import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { Prisma } from "@prisma/client";

import { blogCacheTag, parseBlogTags } from "@/lib/blog-publication";
import { prisma } from "@/lib/prisma";

const BLOG_CACHE_TTL_SECONDS = 300;

export type PublicBlogPost = {
  postId: string;
  workspaceId: string;
  version: number;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string;
  seoTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  noindex: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
  imageCaption: string | null;
  authorName: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  tags: { name: string; slug: string }[];
  publishedAt: string | null;
  modifiedAt: string;
  featuredAt: string | null;
};

type RawPost = Omit<
  PublicBlogPost,
  "tags" | "publishedAt" | "modifiedAt" | "featuredAt"
> & {
  tags: Prisma.JsonValue;
  publishedAt: Date | null;
  modifiedAt: Date;
  featuredAt: Date | null;
};

function serialize(row: RawPost): PublicBlogPost {
  return {
    ...row,
    tags: parseBlogTags(row.tags),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    modifiedAt: row.modifiedAt.toISOString(),
    featuredAt: row.featuredAt?.toISOString() ?? null,
  };
}

const selectPublishedSnapshot = Prisma.sql`
  SELECT
    p."id" AS "postId",
    p."workspaceId",
    v."version",
    v."title",
    v."slug",
    v."excerpt",
    v."body",
    v."seoTitle",
    v."metaDescription",
    v."canonicalUrl",
    v."noindex",
    v."imageUrl",
    v."imageAlt",
    v."imageCaption",
    v."authorName",
    v."categoryName",
    v."categorySlug",
    v."tags",
    p."publishedAt",
    v."createdAt" AS "modifiedAt",
    p."featuredAt"
  FROM "BlogPost" p
  JOIN "BlogPostVersion" v
    ON v."postId" = p."id" AND v."version" = p."publishedVersion"
`;

function visibleCondition(workspaceId: string) {
  return Prisma.sql`
    p."workspaceId" = ${workspaceId}
    AND p."publishedVersion" IS NOT NULL
    AND p."status" IN ('PUBLISHED', 'SCHEDULED')
  `;
}

export async function publicBlogIndex(input: {
  workspaceId: string;
  query?: string;
  category?: string;
  tag?: string;
  page: number;
  pageSize: number;
}) {
  const query = input.query?.trim() ?? "";
  const category = input.category?.trim() ?? "";
  const tag = input.tag?.trim() ?? "";
  const page = Math.max(1, input.page);
  const offset = (page - 1) * input.pageSize;

  return unstable_cache(
    async () => {
      const filters: Prisma.Sql[] = [visibleCondition(input.workspaceId)];
      if (category) filters.push(Prisma.sql`v."categorySlug" = ${category}`);
      if (tag) {
        filters.push(
          Prisma.sql`v."tags" @> ${JSON.stringify([{ slug: tag }])}::jsonb`
        );
      }
      if (query) {
        filters.push(Prisma.sql`
          to_tsvector(
            'simple',
            coalesce(v."title", '') || ' ' ||
            coalesce(v."excerpt", '') || ' ' ||
            regexp_replace(v."body", '<[^>]+>', ' ', 'g')
          ) @@ plainto_tsquery('simple', ${query})
        `);
      }
      const where = Prisma.join(filters, " AND ");
      const [rows, countRows] = await Promise.all([
        prisma.$queryRaw<RawPost[]>(Prisma.sql`
          ${selectPublishedSnapshot}
          WHERE ${where}
          ORDER BY p."featuredAt" DESC NULLS LAST,
                   p."publishedAt" DESC NULLS LAST,
                   p."createdAt" DESC
          LIMIT ${input.pageSize} OFFSET ${offset}
        `),
        prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
          SELECT count(*)::bigint AS "count"
          FROM "BlogPost" p
          JOIN "BlogPostVersion" v
            ON v."postId" = p."id" AND v."version" = p."publishedVersion"
          WHERE ${where}
        `),
      ]);
      return {
        posts: rows.map(serialize),
        total: Number(countRows[0]?.count ?? 0),
      };
    },
    [
      "public-blog-index",
      input.workspaceId,
      query,
      category,
      tag,
      String(page),
      String(input.pageSize),
    ],
    {
      tags: [blogCacheTag(input.workspaceId)],
      revalidate: BLOG_CACHE_TTL_SECONDS,
    }
  )();
}

export const publicBlogPost = cache(
  async (workspaceId: string, slug: string): Promise<PublicBlogPost | null> =>
    unstable_cache(
      async () => {
        const rows = await prisma.$queryRaw<RawPost[]>(Prisma.sql`
          ${selectPublishedSnapshot}
          WHERE ${visibleCondition(workspaceId)}
            AND p."publishedSlug" = ${slug}
          LIMIT 1
        `);
        return rows[0] ? serialize(rows[0]) : null;
      },
      ["public-blog-post", workspaceId, slug],
      {
        tags: [blogCacheTag(workspaceId)],
        revalidate: BLOG_CACHE_TTL_SECONDS,
      }
    )()
);

export async function publicBlogRelated(
  post: Pick<
    PublicBlogPost,
    "postId" | "workspaceId" | "categorySlug" | "tags"
  >,
  take = 3
) {
  const candidates = await publicBlogIndex({
    workspaceId: post.workspaceId,
    category: post.categorySlug ?? undefined,
    page: 1,
    pageSize: Math.max(take + 1, 8),
  });
  const tagSlugs = new Set(post.tags.map((tag) => tag.slug));
  return candidates.posts
    .filter((item) => item.postId !== post.postId)
    .sort((a, b) => {
      const aMatches = a.tags.filter((tag) => tagSlugs.has(tag.slug)).length;
      const bMatches = b.tags.filter((tag) => tagSlugs.has(tag.slug)).length;
      return bMatches - aMatches;
    })
    .slice(0, take);
}

export async function publicBlogTaxonomy(workspaceId: string) {
  return unstable_cache(
    async () => {
      const rows = await prisma.$queryRaw<
        { categoryName: string | null; categorySlug: string | null; tags: Prisma.JsonValue }[]
      >(Prisma.sql`
        SELECT v."categoryName", v."categorySlug", v."tags"
        FROM "BlogPost" p
        JOIN "BlogPostVersion" v
          ON v."postId" = p."id" AND v."version" = p."publishedVersion"
        WHERE ${visibleCondition(workspaceId)}
      `);
      const categories = new Map<string, { name: string; slug: string; count: number }>();
      const tags = new Map<string, { name: string; slug: string; count: number }>();
      for (const row of rows) {
        if (row.categoryName && row.categorySlug) {
          const current = categories.get(row.categorySlug);
          categories.set(row.categorySlug, {
            name: row.categoryName,
            slug: row.categorySlug,
            count: (current?.count ?? 0) + 1,
          });
        }
        for (const tag of parseBlogTags(row.tags)) {
          const current = tags.get(tag.slug);
          tags.set(tag.slug, { ...tag, count: (current?.count ?? 0) + 1 });
        }
      }
      return {
        categories: [...categories.values()].sort((a, b) =>
          a.name.localeCompare(b.name)
        ),
        tags: [...tags.values()]
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
          .slice(0, 18),
        total: rows.length,
      };
    },
    ["public-blog-taxonomy", workspaceId],
    { tags: [blogCacheTag(workspaceId)], revalidate: BLOG_CACHE_TTL_SECONDS }
  )();
}

export async function findBlogSlugRedirect(workspaceId: string, slug: string) {
  const moved = await prisma.blogSlugHistory.findUnique({
    where: { workspaceId_slug: { workspaceId, slug } },
    select: {
      post: {
        select: { publishedSlug: true, status: true, publishedVersion: true },
      },
    },
  });
  if (
    !moved?.post.publishedSlug ||
    !moved.post.publishedVersion ||
    !["PUBLISHED", "SCHEDULED"].includes(moved.post.status)
  ) {
    return null;
  }
  return moved.post.publishedSlug;
}
