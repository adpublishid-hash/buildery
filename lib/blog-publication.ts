import "server-only";

import { revalidateTag } from "next/cache";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { sanitizeRichHtml } from "@/lib/rich-html";
import { stripRichText } from "@/lib/rich-text";

type Tx = Prisma.TransactionClient;

const draftInclude = {
  image: { select: { url: true } },
  author: { select: { name: true } },
  category: { select: { name: true, slug: true } },
  tags: { select: { name: true, slug: true }, orderBy: { name: "asc" as const } },
} satisfies Prisma.BlogPostInclude;

type DraftWithRelations = Prisma.BlogPostGetPayload<{
  include: typeof draftInclude;
}>;

export type PublishedBlogTag = { name: string; slug: string };

export type PublishedBlogPost = {
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
  tags: PublishedBlogTag[];
  publishedAt: Date | null;
  modifiedAt: Date;
  featuredAt: Date | null;
};

export function blogCacheTag(workspaceId: string) {
  return `blog:${workspaceId}`;
}

export function revalidateBlog(workspaceId: string) {
  try {
    revalidateTag(blogCacheTag(workspaceId));
  } catch {
    // Jobs and tests may run without a Next request cache scope.
  }
}

export function parseBlogTags(value: Prisma.JsonValue): PublishedBlogTag[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const name = "name" in item ? item.name : null;
    const slug = "slug" in item ? item.slug : null;
    return typeof name === "string" && typeof slug === "string"
      ? [{ name, slug }]
      : [];
  });
}

function ensurePublishable(post: DraftWithRelations) {
  const body = sanitizeRichHtml(post.body);
  if (!stripRichText(body).trim()) {
    throw new Error("Add article content before publishing.");
  }
  if (!post.slug.trim()) throw new Error("A slug is required before publishing.");
  return body;
}

async function createVersion(tx: Tx, post: DraftWithRelations) {
  const body = ensurePublishable(post);
  const latest = await tx.blogPostVersion.aggregate({
    where: { postId: post.id },
    _max: { version: true },
  });
  const version = (latest._max.version ?? 0) + 1;
  return tx.blogPostVersion.create({
    data: {
      postId: post.id,
      version,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      body,
      seoTitle: post.seoTitle,
      metaDescription: post.metaDescription,
      canonicalUrl: post.canonicalUrl,
      noindex: post.noindex,
      imageUrl: post.image?.url ?? null,
      imageAlt: post.imageAlt,
      imageCaption: post.imageCaption,
      authorName: post.author?.name ?? null,
      categoryName: post.category?.name ?? null,
      categorySlug: post.category?.slug ?? null,
      tags: post.tags,
    },
  });
}

async function rememberOldSlug(
  tx: Tx,
  post: Pick<DraftWithRelations, "id" | "workspaceId" | "publishedSlug">,
  nextSlug: string
) {
  if (!post.publishedSlug || post.publishedSlug === nextSlug) return;
  await tx.blogSlugHistory.upsert({
    where: {
      workspaceId_slug: {
        workspaceId: post.workspaceId,
        slug: post.publishedSlug,
      },
    },
    update: { postId: post.id },
    create: {
      workspaceId: post.workspaceId,
      postId: post.id,
      slug: post.publishedSlug,
    },
  });
}

async function activateVersion(
  tx: Tx,
  post: DraftWithRelations,
  version: { version: number; slug: string },
  now: Date
) {
  await rememberOldSlug(tx, post, version.slug);
  await tx.blogPost.update({
    where: { id: post.id },
    data: {
      status: "PUBLISHED",
      publishedSlug: version.slug,
      publishedVersion: version.version,
      scheduledVersion: null,
      scheduledAt: null,
      archivedAt: null,
      publishedAt: post.publishedAt ?? now,
    },
  });
  await tx.scheduledJob.updateMany({
    where: {
      dedupeKey: `blog-publish:${post.id}`,
      status: "PENDING",
    },
    data: { status: "CANCELED", finishedAt: now },
  });
}

export async function publishBlogPost(postId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const post = await tx.blogPost.findUnique({
      where: { id: postId },
      include: draftInclude,
    });
    if (!post) throw new Error("Post not found.");
    const version = await createVersion(tx, post);
    await activateVersion(tx, post, version, new Date());
    return { workspaceId: post.workspaceId, version: version.version };
  });
  revalidateBlog(result.workspaceId);
  return result;
}

export async function scheduleBlogPost(postId: string, scheduledAt: Date) {
  if (scheduledAt.getTime() <= Date.now()) {
    throw new Error("Scheduled time must be in the future.");
  }
  const result = await prisma.$transaction(async (tx) => {
    const post = await tx.blogPost.findUnique({
      where: { id: postId },
      include: draftInclude,
    });
    if (!post) throw new Error("Post not found.");
    const version = await createVersion(tx, post);
    await tx.blogPost.update({
      where: { id: post.id },
      data: {
        status: "SCHEDULED",
        scheduledAt,
        scheduledVersion: version.version,
        archivedAt: null,
      },
    });
    await tx.scheduledJob.updateMany({
      where: {
        dedupeKey: `blog-publish:${post.id}`,
        status: "PENDING",
      },
      data: { status: "CANCELED", finishedAt: new Date() },
    });
    await tx.scheduledJob.create({
      data: {
        kind: "BLOG_PUBLICATION",
        workspaceId: post.workspaceId,
        runAt: scheduledAt,
        payload: { postId: post.id, version: version.version },
        dedupeKey: `blog-publish:${post.id}`,
        maxAttempts: 5,
      },
    });
    return { workspaceId: post.workspaceId, version: version.version };
  });
  revalidateBlog(result.workspaceId);
  return result;
}

export async function publishScheduledBlogPost(
  postId: string,
  expectedVersion: number
) {
  const result = await prisma.$transaction(async (tx) => {
    const post = await tx.blogPost.findUnique({
      where: { id: postId },
      include: draftInclude,
    });
    if (!post) return { detail: "post no longer exists", workspaceId: null };
    if (
      post.status !== "SCHEDULED" ||
      post.scheduledVersion !== expectedVersion ||
      !post.scheduledAt ||
      post.scheduledAt.getTime() > Date.now()
    ) {
      return { detail: "schedule superseded or not due", workspaceId: null };
    }
    const version = await tx.blogPostVersion.findUnique({
      where: { postId_version: { postId, version: expectedVersion } },
      select: { version: true, slug: true },
    });
    if (!version) throw new Error("Scheduled blog version is missing.");
    await activateVersion(tx, post, version, new Date());
    return {
      detail: `published ${postId} version ${expectedVersion}`,
      workspaceId: post.workspaceId,
    };
  });
  if (result.workspaceId) revalidateBlog(result.workspaceId);
  return result.detail;
}

export function toPublishedBlogPost(input: {
  post: {
    id: string;
    workspaceId: string;
    publishedAt: Date | null;
    featuredAt: Date | null;
  };
  version: {
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
    tags: Prisma.JsonValue;
    createdAt: Date;
  };
}): PublishedBlogPost {
  return {
    postId: input.post.id,
    workspaceId: input.post.workspaceId,
    publishedAt: input.post.publishedAt,
    featuredAt: input.post.featuredAt,
    modifiedAt: input.version.createdAt,
    ...input.version,
    tags: parseBlogTags(input.version.tags),
  };
}
