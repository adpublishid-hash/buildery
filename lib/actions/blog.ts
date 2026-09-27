"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { BlogPostStatus, Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import {
  parseBlogTags,
  publishBlogPost,
  revalidateBlog,
  scheduleBlogPost,
} from "@/lib/blog-publication";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sanitizeRichHtml } from "@/lib/rich-html";
import { stripRichText } from "@/lib/rich-text";
import { assertCanCreate } from "@/lib/saas-limits";
import { slugify } from "@/lib/slug";
import { deleteOrphanUpload } from "@/lib/upload-cleanup";
import { getCurrentWorkspace } from "@/lib/workspace";
import { blogCategorySchema, blogPostSchema } from "@/lib/zod";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type Tx = Prisma.TransactionClient;

class BlogActionError extends Error {
  constructor(
    message: string,
    readonly field?: string
  ) {
    super(message);
  }
}

async function requireEditableWorkspace() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) return null;
  return { workspace: current.workspace, userId: session.user.id };
}

async function resolveCategoryId(
  tx: Tx,
  workspaceId: string,
  name: string | undefined
) {
  const clean = name?.trim();
  if (!clean) return null;
  const slug = slugify(clean) || "category";
  const existing = await tx.blogCategory.findUnique({
    where: { workspaceId_slug: { workspaceId, slug } },
    select: { id: true },
  });
  if (existing) return existing.id;
  return (
    await tx.blogCategory.create({ data: { workspaceId, slug, name: clean } })
  ).id;
}

async function resolveTagIds(
  tx: Tx,
  workspaceId: string,
  csv: string | undefined
) {
  const names = Array.from(
    new Set(
      (csv ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 20)
    )
  );
  const ids: string[] = [];
  for (const name of names) {
    const slug = slugify(name) || "tag";
    const existing = await tx.blogTag.findUnique({
      where: { workspaceId_slug: { workspaceId, slug } },
      select: { id: true },
    });
    const tag =
      existing ??
      (await tx.blogTag.create({
        data: { workspaceId, slug, name },
        select: { id: true },
      }));
    ids.push(tag.id);
  }
  return ids;
}

async function validateImageId(
  tx: Tx,
  workspaceId: string,
  imageId?: string
) {
  if (!imageId) return null;
  const image = await tx.uploadFile.findUnique({
    where: { id: imageId },
    select: { id: true, workspaceId: true },
  });
  if (!image || image.workspaceId !== workspaceId) {
    throw new BlogActionError("Choose an image from this workspace.", "imageId");
  }
  return image.id;
}

async function assertSlugAvailable(
  tx: Tx,
  workspaceId: string,
  slug: string,
  exceptPostId?: string
) {
  const [post, history] = await Promise.all([
    tx.blogPost.findFirst({
      where: {
        workspaceId,
        ...(exceptPostId ? { id: { not: exceptPostId } } : {}),
        OR: [{ slug }, { publishedSlug: slug }],
      },
      select: { id: true },
    }),
    tx.blogSlugHistory.findUnique({
      where: { workspaceId_slug: { workspaceId, slug } },
      select: { postId: true },
    }),
  ]);
  if (post || (history && history.postId !== exceptPostId)) {
    throw new BlogActionError("That slug is already taken.", "slug");
  }
}

function parseForm(formData: FormData) {
  return blogPostSchema.safeParse({
    title: formData.get("title"),
    slug: formData.get("slug"),
    excerpt: (formData.get("excerpt") as string | null) || undefined,
    body: formData.get("body") ?? "",
    status: formData.get("status") ?? "DRAFT",
    category: (formData.get("category") as string | null) || undefined,
    tags: (formData.get("tags") as string | null) || undefined,
    seoTitle: (formData.get("seoTitle") as string | null) || undefined,
    metaDescription:
      (formData.get("metaDescription") as string | null) || undefined,
    canonicalUrl: (formData.get("canonicalUrl") as string | null) || undefined,
    noindex: String(formData.get("noindex") ?? "false"),
    imageAlt: (formData.get("imageAlt") as string | null) || undefined,
    imageCaption: (formData.get("imageCaption") as string | null) || undefined,
    scheduledAt: String(formData.get("scheduledAt") ?? ""),
    featured: String(formData.get("featured") ?? "false"),
    imageId: formData.get("imageId") || "",
  });
}

function parsedFailure<T = unknown>(error: {
  flatten(): { fieldErrors: unknown };
}): ActionResult<T> {
  return {
    ok: false,
    error: "Please check the form for errors.",
    fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
  };
}

function actionFailure(error: unknown): ActionResult {
  if (error instanceof BlogActionError) {
    return {
      ok: false,
      error: error.message,
      ...(error.field ? { fieldErrors: { [error.field]: [error.message] } } : {}),
    };
  }
  if ((error as { code?: string })?.code === "P2002") {
    return {
      ok: false,
      error: "That slug or taxonomy name is already in use.",
    };
  }
  throw error;
}

function ensureReadyForPublication(body: string, scheduledAt?: Date) {
  if (!stripRichText(body).trim()) {
    throw new BlogActionError("Add article content before publishing.", "body");
  }
  if (scheduledAt && scheduledAt.getTime() <= Date.now()) {
    throw new BlogActionError(
      "Scheduled time must be in the future.",
      "scheduledAt"
    );
  }
}

async function applyPublicationIntent(
  postId: string,
  status: BlogPostStatus,
  scheduledAt?: Date
) {
  if (status === "PUBLISHED") return publishBlogPost(postId);
  if (status === "SCHEDULED") {
    if (!scheduledAt) {
      throw new BlogActionError("Choose a publication time.", "scheduledAt");
    }
    return scheduleBlogPost(postId, scheduledAt);
  }
  if (status === "ARCHIVED") {
    const now = new Date();
    await prisma.$transaction([
      prisma.blogPost.update({
        where: { id: postId },
        data: {
          status: "ARCHIVED",
          archivedAt: now,
          scheduledAt: null,
          scheduledVersion: null,
        },
      }),
      prisma.scheduledJob.updateMany({
        where: { dedupeKey: `blog-publish:${postId}`, status: "PENDING" },
        data: { status: "CANCELED", finishedAt: now },
      }),
    ]);
  }
}

export async function createBlogPostAction(
  formData: FormData
): Promise<ActionResult<{ postId: string }>> {
  const ctx = await requireEditableWorkspace();
  if (!ctx) return { ok: false, error: "Not allowed." };
  const overLimit = await assertCanCreate(ctx.workspace.createdById, "blog");
  if (overLimit) return { ok: false, error: overLimit };

  const parsed = parseForm(formData);
  if (!parsed.success) return parsedFailure(parsed.error);
  const body = sanitizeRichHtml(parsed.data.body);
  if (parsed.data.status !== "DRAFT") {
    ensureReadyForPublication(body, parsed.data.scheduledAt);
  }

  try {
    const post = await prisma.$transaction(async (tx) => {
      const slug = slugify(parsed.data.slug);
      await assertSlugAvailable(tx, ctx.workspace.id, slug);
      const [categoryId, tagIds, imageId] = await Promise.all([
        resolveCategoryId(tx, ctx.workspace.id, parsed.data.category),
        resolveTagIds(tx, ctx.workspace.id, parsed.data.tags),
        validateImageId(tx, ctx.workspace.id, parsed.data.imageId),
      ]);
      return tx.blogPost.create({
        data: {
          workspaceId: ctx.workspace.id,
          authorId: ctx.userId,
          title: parsed.data.title.trim(),
          slug,
          excerpt: parsed.data.excerpt?.trim() || null,
          body,
          status: "DRAFT",
          seoTitle: parsed.data.seoTitle?.trim() || null,
          metaDescription: parsed.data.metaDescription?.trim() || null,
          canonicalUrl: parsed.data.canonicalUrl?.trim() || null,
          noindex: parsed.data.noindex,
          imageAlt: parsed.data.imageAlt?.trim() || null,
          imageCaption: parsed.data.imageCaption?.trim() || null,
          imageId,
          categoryId,
          featuredAt: parsed.data.featured ? new Date() : null,
          isPopular: parsed.data.featured,
          tags: tagIds.length
            ? { connect: tagIds.map((id) => ({ id })) }
            : undefined,
        },
      });
    });

    await applyPublicationIntent(
      post.id,
      parsed.data.status,
      parsed.data.scheduledAt
    );
    revalidateBlog(ctx.workspace.id);
    revalidatePath("/dashboard/blog");
    return { ok: true, data: { postId: post.id } };
  } catch (error) {
    return actionFailure(error) as ActionResult<{ postId: string }>;
  }
}

export async function updateBlogPostAction(
  postId: string,
  formData: FormData
): Promise<ActionResult> {
  const ctx = await requireEditableWorkspace();
  if (!ctx) return { ok: false, error: "Not allowed." };
  const current = await prisma.blogPost.findUnique({
    where: { id: postId },
    select: { workspaceId: true, status: true, featuredAt: true, imageId: true },
  });
  if (!current || current.workspaceId !== ctx.workspace.id) {
    return { ok: false, error: "Post not found." };
  }

  const parsed = parseForm(formData);
  if (!parsed.success) return parsedFailure(parsed.error);
  const body = sanitizeRichHtml(parsed.data.body);
  if (parsed.data.status === "PUBLISHED" || parsed.data.status === "SCHEDULED") {
    ensureReadyForPublication(body, parsed.data.scheduledAt);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const slug = slugify(parsed.data.slug);
      await assertSlugAvailable(tx, ctx.workspace.id, slug, postId);
      const [categoryId, tagIds, imageId] = await Promise.all([
        resolveCategoryId(tx, ctx.workspace.id, parsed.data.category),
        resolveTagIds(tx, ctx.workspace.id, parsed.data.tags),
        validateImageId(tx, ctx.workspace.id, parsed.data.imageId),
      ]);
      await tx.blogPost.update({
        where: { id: postId },
        data: {
          title: parsed.data.title.trim(),
          slug,
          excerpt: parsed.data.excerpt?.trim() || null,
          body,
          seoTitle: parsed.data.seoTitle?.trim() || null,
          metaDescription: parsed.data.metaDescription?.trim() || null,
          canonicalUrl: parsed.data.canonicalUrl?.trim() || null,
          noindex: parsed.data.noindex,
          imageAlt: parsed.data.imageAlt?.trim() || null,
          imageCaption: parsed.data.imageCaption?.trim() || null,
          imageId,
          categoryId,
          featuredAt: parsed.data.featured
            ? current.featuredAt ?? new Date()
            : null,
          isPopular: parsed.data.featured,
          tags: { set: tagIds.map((id) => ({ id })) },
        },
      });
    });

    // Saving a draft for an already-live post deliberately leaves the current
    // public version untouched. Publishing is the explicit promotion step.
    if (parsed.data.status !== "DRAFT" || current.status === "DRAFT") {
      await applyPublicationIntent(
        postId,
        parsed.data.status,
        parsed.data.scheduledAt
      );
    }
    revalidateBlog(ctx.workspace.id);
    revalidatePath("/dashboard/blog");
    revalidatePath(`/dashboard/blog/${postId}/edit`);
    if (current.imageId && current.imageId !== parsed.data.imageId) {
      await deleteOrphanUpload(current.imageId).catch(() => false);
    }
    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function setBlogPostStatusAction(
  postId: string,
  status: BlogPostStatus
): Promise<ActionResult> {
  const ctx = await requireEditableWorkspace();
  if (!ctx) return { ok: false, error: "Not allowed." };
  const post = await prisma.blogPost.findUnique({
    where: { id: postId },
    select: { workspaceId: true },
  });
  if (!post || post.workspaceId !== ctx.workspace.id) {
    return { ok: false, error: "Post not found." };
  }
  try {
    if (status === "PUBLISHED") {
      await publishBlogPost(postId);
    } else if (status === "DRAFT" || status === "ARCHIVED") {
      const now = new Date();
      await prisma.$transaction([
        prisma.blogPost.update({
          where: { id: postId },
          data: {
            status,
            scheduledAt: null,
            scheduledVersion: null,
            archivedAt: status === "ARCHIVED" ? now : null,
          },
        }),
        prisma.scheduledJob.updateMany({
          where: {
            dedupeKey: `blog-publish:${postId}`,
            status: "PENDING",
          },
          data: { status: "CANCELED", finishedAt: now },
        }),
      ]);
    } else {
      return { ok: false, error: "Choose a schedule from the editor." };
    }
    revalidateBlog(ctx.workspace.id);
    revalidatePath("/dashboard/blog");
    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function restoreBlogVersionAction(
  postId: string,
  versionNumber: number
): Promise<ActionResult> {
  const ctx = await requireEditableWorkspace();
  if (!ctx) return { ok: false, error: "Not allowed." };
  const post = await prisma.blogPost.findUnique({
    where: { id: postId },
    select: { workspaceId: true, imageId: true },
  });
  if (!post || post.workspaceId !== ctx.workspace.id) {
    return { ok: false, error: "Post not found." };
  }
  const version = await prisma.blogPostVersion.findUnique({
    where: { postId_version: { postId, version: versionNumber } },
  });
  if (!version) return { ok: false, error: "Version not found." };

  try {
    let restoredImageId: string | null = null;
    await prisma.$transaction(async (tx) => {
      const tags = parseBlogTags(version.tags);
      const [categoryId, tagIds, image] = await Promise.all([
        resolveCategoryId(tx, ctx.workspace.id, version.categoryName ?? undefined),
        resolveTagIds(
          tx,
          ctx.workspace.id,
          tags.map((tag) => tag.name).join(",")
        ),
        version.imageUrl
          ? tx.uploadFile.findFirst({
              where: { workspaceId: ctx.workspace.id, url: version.imageUrl },
              select: { id: true },
            })
          : null,
      ]);
      restoredImageId = image?.id ?? null;
      await assertSlugAvailable(tx, ctx.workspace.id, version.slug, postId);
      await tx.blogPost.update({
        where: { id: postId },
        data: {
          title: version.title,
          slug: version.slug,
          excerpt: version.excerpt,
          body: version.body,
          seoTitle: version.seoTitle,
          metaDescription: version.metaDescription,
          canonicalUrl: version.canonicalUrl,
          noindex: version.noindex,
          imageId: image?.id ?? null,
          imageAlt: version.imageAlt,
          imageCaption: version.imageCaption,
          categoryId,
          tags: { set: tagIds.map((id) => ({ id })) },
        },
      });
    });
    if (post.imageId && post.imageId !== restoredImageId) {
      await deleteOrphanUpload(post.imageId).catch(() => false);
    }
    revalidatePath(`/dashboard/blog/${postId}/edit`);
    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function duplicateBlogPostAction(
  postId: string
): Promise<ActionResult<{ postId: string }>> {
  const ctx = await requireEditableWorkspace();
  if (!ctx) return { ok: false, error: "Not allowed." };
  const overLimit = await assertCanCreate(ctx.workspace.createdById, "blog");
  if (overLimit) return { ok: false, error: overLimit };
  const source = await prisma.blogPost.findUnique({
    where: { id: postId },
    include: { tags: { select: { id: true } } },
  });
  if (!source || source.workspaceId !== ctx.workspace.id) {
    return { ok: false, error: "Post not found." };
  }
  let suffix = 2;
  let slug = `${source.slug}-copy`;
  while (
    await prisma.blogPost.findFirst({
      where: { workspaceId: ctx.workspace.id, slug },
      select: { id: true },
    })
  ) {
    slug = `${source.slug}-copy-${suffix++}`;
  }
  const copy = await prisma.blogPost.create({
    data: {
      workspaceId: source.workspaceId,
      authorId: ctx.userId,
      categoryId: source.categoryId,
      imageId: source.imageId,
      title: `${source.title} (Copy)`,
      slug,
      excerpt: source.excerpt,
      body: source.body,
      status: "DRAFT",
      seoTitle: source.seoTitle,
      metaDescription: source.metaDescription,
      canonicalUrl: source.canonicalUrl,
      noindex: source.noindex,
      imageAlt: source.imageAlt,
      imageCaption: source.imageCaption,
      tags: { connect: source.tags.map((tag) => ({ id: tag.id })) },
    },
  });
  revalidatePath("/dashboard/blog");
  return { ok: true, data: { postId: copy.id } };
}

export async function deleteBlogPostAction(postId: string): Promise<ActionResult> {
  const ctx = await requireEditableWorkspace();
  if (!ctx) return { ok: false, error: "Not allowed." };
  const post = await prisma.blogPost.findUnique({
    where: { id: postId },
    select: { workspaceId: true, imageId: true },
  });
  if (!post || post.workspaceId !== ctx.workspace.id) {
    return { ok: false, error: "Post not found." };
  }
  await prisma.$transaction([
    prisma.scheduledJob.updateMany({
      where: { dedupeKey: `blog-publish:${postId}`, status: "PENDING" },
      data: { status: "CANCELED", finishedAt: new Date() },
    }),
    prisma.blogPost.delete({ where: { id: postId } }),
  ]);
  revalidateBlog(ctx.workspace.id);
  revalidatePath("/dashboard/blog");
  await deleteOrphanUpload(post.imageId).catch(() => false);
  return { ok: true };
}

// ----- Categories and tags -----

export async function createBlogCategoryAction(
  formData: FormData
): Promise<ActionResult> {
  const ctx = await requireEditableWorkspace();
  if (!ctx) return { ok: false, error: "Not allowed." };
  const parsed = blogCategorySchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return parsedFailure(parsed.error);
  const name = parsed.data.name.trim();
  const slug = slugify(name);
  await prisma.blogCategory.upsert({
    where: { workspaceId_slug: { workspaceId: ctx.workspace.id, slug } },
    update: {},
    create: { workspaceId: ctx.workspace.id, name, slug },
  });
  revalidatePath("/dashboard/blog/categories");
  return { ok: true };
}

export async function renameBlogCategoryAction(
  categoryId: string,
  name: string
): Promise<ActionResult> {
  const ctx = await requireEditableWorkspace();
  if (!ctx) return { ok: false, error: "Not allowed." };
  const parsed = blogCategorySchema.safeParse({ name });
  if (!parsed.success) return parsedFailure(parsed.error);
  const category = await prisma.blogCategory.findUnique({
    where: { id: categoryId },
    select: { workspaceId: true },
  });
  if (!category || category.workspaceId !== ctx.workspace.id) {
    return { ok: false, error: "Category not found." };
  }
  try {
    await prisma.blogCategory.update({
      where: { id: categoryId },
      data: { name: parsed.data.name.trim(), slug: slugify(parsed.data.name) },
    });
    revalidateBlog(ctx.workspace.id);
    revalidatePath("/dashboard/blog/categories");
    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function deleteBlogCategoryAction(
  categoryId: string
): Promise<ActionResult> {
  const ctx = await requireEditableWorkspace();
  if (!ctx) return { ok: false, error: "Not allowed." };
  const category = await prisma.blogCategory.findUnique({
    where: { id: categoryId },
    select: { workspaceId: true },
  });
  if (!category || category.workspaceId !== ctx.workspace.id) {
    return { ok: false, error: "Category not found." };
  }
  await prisma.blogCategory.delete({ where: { id: categoryId } });
  revalidateBlog(ctx.workspace.id);
  revalidatePath("/dashboard/blog/categories");
  revalidatePath("/dashboard/blog");
  return { ok: true };
}

export async function mergeBlogCategoryAction(
  sourceId: string,
  targetId: string
): Promise<ActionResult> {
  const ctx = await requireEditableWorkspace();
  if (!ctx) return { ok: false, error: "Not allowed." };
  if (sourceId === targetId) {
    return { ok: false, error: "Choose a different destination category." };
  }
  const categories = await prisma.blogCategory.findMany({
    where: { id: { in: [sourceId, targetId] }, workspaceId: ctx.workspace.id },
    select: { id: true },
  });
  if (categories.length !== 2) {
    return { ok: false, error: "Category not found." };
  }
  await prisma.$transaction([
    prisma.blogPost.updateMany({
      where: { workspaceId: ctx.workspace.id, categoryId: sourceId },
      data: { categoryId: targetId },
    }),
    prisma.blogCategory.delete({ where: { id: sourceId } }),
  ]);
  revalidateBlog(ctx.workspace.id);
  revalidatePath("/dashboard/blog/categories");
  revalidatePath("/dashboard/blog");
  return { ok: true };
}

export async function createBlogTagAction(
  formData: FormData
): Promise<ActionResult> {
  const ctx = await requireEditableWorkspace();
  if (!ctx) return { ok: false, error: "Not allowed." };
  const parsed = blogCategorySchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return parsedFailure(parsed.error);
  const name = parsed.data.name.trim();
  const slug = slugify(name);
  await prisma.blogTag.upsert({
    where: { workspaceId_slug: { workspaceId: ctx.workspace.id, slug } },
    update: {},
    create: { workspaceId: ctx.workspace.id, name, slug },
  });
  revalidatePath("/dashboard/blog/categories");
  return { ok: true };
}

export async function renameBlogTagAction(
  tagId: string,
  name: string
): Promise<ActionResult> {
  const ctx = await requireEditableWorkspace();
  if (!ctx) return { ok: false, error: "Not allowed." };
  const parsed = blogCategorySchema.safeParse({ name });
  if (!parsed.success) return parsedFailure(parsed.error);
  const tag = await prisma.blogTag.findUnique({
    where: { id: tagId },
    select: { workspaceId: true },
  });
  if (!tag || tag.workspaceId !== ctx.workspace.id) {
    return { ok: false, error: "Tag not found." };
  }
  try {
    await prisma.blogTag.update({
      where: { id: tagId },
      data: { name: parsed.data.name.trim(), slug: slugify(parsed.data.name) },
    });
    revalidateBlog(ctx.workspace.id);
    revalidatePath("/dashboard/blog/categories");
    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function deleteBlogTagAction(tagId: string): Promise<ActionResult> {
  const ctx = await requireEditableWorkspace();
  if (!ctx) return { ok: false, error: "Not allowed." };
  const tag = await prisma.blogTag.findUnique({
    where: { id: tagId },
    select: { workspaceId: true },
  });
  if (!tag || tag.workspaceId !== ctx.workspace.id) {
    return { ok: false, error: "Tag not found." };
  }
  await prisma.blogTag.delete({ where: { id: tagId } });
  revalidateBlog(ctx.workspace.id);
  revalidatePath("/dashboard/blog/categories");
  return { ok: true };
}

export async function mergeBlogTagAction(
  sourceId: string,
  targetId: string
): Promise<ActionResult> {
  const ctx = await requireEditableWorkspace();
  if (!ctx) return { ok: false, error: "Not allowed." };
  if (sourceId === targetId) {
    return { ok: false, error: "Choose a different destination tag." };
  }
  const tags = await prisma.blogTag.findMany({
    where: { id: { in: [sourceId, targetId] }, workspaceId: ctx.workspace.id },
    include: { posts: { select: { id: true } } },
  });
  const source = tags.find((tag) => tag.id === sourceId);
  if (!source || tags.length !== 2) return { ok: false, error: "Tag not found." };
  await prisma.$transaction(async (tx) => {
    for (const post of source.posts) {
      await tx.blogPost.update({
        where: { id: post.id },
        data: { tags: { connect: { id: targetId } } },
      });
    }
    await tx.blogTag.delete({ where: { id: sourceId } });
  });
  revalidateBlog(ctx.workspace.id);
  revalidatePath("/dashboard/blog/categories");
  revalidatePath("/dashboard/blog");
  return { ok: true };
}
