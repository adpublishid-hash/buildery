"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PageStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishBlocker } from "@/lib/page-publish-guard";

const PAGE_STATUSES: PageStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];
import { canInWorkspace } from "@/lib/permissions";
import { getCurrentWorkspace } from "@/lib/workspace";
import { revalidatePublicPages } from "@/lib/public-page";
import { getOrCreateDefaultWebsite } from "@/lib/website";
import { assertCanCreate } from "@/lib/saas-limits";
import { slugify } from "@/lib/slug";
import { pageBlocksSchema } from "@/lib/blocks/schema";
import {
  createPageSchema,
  updatePageSettingsSchema,
  updateWebsiteSchema,
} from "@/lib/zod";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** Verifies the signed-in user may edit content in the page's workspace. */
async function loadEditablePage(pageId: string, userId: string) {
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
  if (!membership || !canInWorkspace(membership.role, "content.edit")) {
    return null;
  }
  return page;
}

async function revalidateWorkspaceSite(workspaceId: string) {
  // Published pages are served from a tagged cache, not from the route cache.
  revalidatePublicPages(workspaceId);
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { slug: true },
  });
  if (workspace) revalidatePath(`/site/${workspace.slug}`);
}

export async function createPageAction(
  formData: FormData
): Promise<ActionResult<{ pageId: string }>> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const current = await getCurrentWorkspace(session.user.id);
  if (!current) return { ok: false, error: "No active workspace." };
  if (!canInWorkspace(current.role, "content.edit")) {
    return { ok: false, error: "You don't have permission to create pages." };
  }

  const parsed = createPageSchema.safeParse({
    title: formData.get("title"),
    slug: formData.get("slug"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the form for errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  // SaaS limits are charged to the workspace's owner.
  const overLimit = await assertCanCreate(
    current.workspace.createdById,
    "page"
  );
  if (overLimit) return { ok: false, error: overLimit };

  const website = await getOrCreateDefaultWebsite(current.workspace.id);
  const slug = slugify(parsed.data.slug);

  const conflict = await prisma.page.findUnique({
    where: { websiteId_slug: { websiteId: website.id, slug } },
    select: { id: true },
  });
  if (conflict) {
    return {
      ok: false,
      error: "A page with that slug already exists.",
      fieldErrors: { slug: ["That slug is already taken."] },
    };
  }

  const page = await prisma.page.create({
    data: {
      websiteId: website.id,
      title: parsed.data.title.trim(),
      slug,
      status: "DRAFT",
    },
  });

  revalidatePath("/dashboard/pages");
  // A first page becomes the site's fallback homepage, which is cached.
  await revalidateWorkspaceSite(website.workspaceId);
  return { ok: true, data: { pageId: page.id } };
}

export async function updatePageSettingsAction(
  pageId: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const page = await loadEditablePage(pageId, session.user.id);
  if (!page) return { ok: false, error: "Not allowed." };

  const parsed = updatePageSettingsSchema.safeParse({
    title: formData.get("title"),
    slug: formData.get("slug"),
    status: formData.get("status"),
    seoTitle: formData.get("seoTitle"),
    metaDescription: formData.get("metaDescription"),
    ogImage: formData.get("ogImage"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the form for errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const slug = slugify(parsed.data.slug);
  const conflict = await prisma.page.findFirst({
    where: { websiteId: page.websiteId, slug, NOT: { id: pageId } },
    select: { id: true },
  });
  if (conflict) {
    return {
      ok: false,
      error: "That slug is already taken.",
      fieldErrors: { slug: ["That slug is already taken."] },
    };
  }

  const nextStatus = parsed.data.status as PageStatus;
  // Jalur ini dulu menerbitkan tanpa pemeriksaan apa pun — bahkan aturan
  // "halaman kosong tidak boleh terbit" yang ditegakkan API route bisa
  // dilewati lewat server action ini.
  if (nextStatus === "PUBLISHED" && page.status !== "PUBLISHED") {
    const blocker = await publishBlocker(pageId);
    if (blocker) return { ok: false, error: blocker };
  }
  const publishedAt =
    nextStatus === "PUBLISHED"
      ? page.publishedAt ?? new Date()
      : nextStatus === "ARCHIVED"
        ? page.publishedAt
        : null;

  await prisma.$transaction([
    prisma.page.update({
      where: { id: pageId },
      data: {
        title: parsed.data.title.trim(),
        slug,
        status: nextStatus,
        seoTitle: parsed.data.seoTitle?.trim() || null,
        metaDescription: parsed.data.metaDescription?.trim() || null,
        ogImage: parsed.data.ogImage?.trim() || null,
        publishedAt,
      },
    }),
    ...(nextStatus !== "PUBLISHED" && page.website.homePageId === pageId
      ? [
          prisma.website.update({
            where: { id: page.websiteId },
            data: { homePageId: null },
          }),
        ]
      : []),
  ]);

  revalidatePath("/dashboard/pages");
  revalidatePath(`/dashboard/pages/${pageId}/settings`);
  await revalidateWorkspaceSite(page.website.workspaceId);
  return { ok: true };
}

export async function savePageBlocksAction(
  pageId: string,
  blocksJson: string
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const page = await loadEditablePage(pageId, session.user.id);
  if (!page) return { ok: false, error: "Not allowed." };

  let raw: unknown;
  try {
    raw = JSON.parse(blocksJson);
  } catch {
    return { ok: false, error: "Could not read the layout payload." };
  }

  const parsed = pageBlocksSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Some blocks have invalid content." };
  }

  await prisma.$transaction([
    prisma.pageBlock.deleteMany({ where: { pageId } }),
    prisma.pageBlock.createMany({
      data: parsed.data.map((block, index) => ({
        pageId,
        type: block.type,
        order: index,
        data: block.data,
      })),
    }),
    prisma.page.update({
      where: { id: pageId },
      data: { updatedAt: new Date() },
    }),
  ]);

  revalidatePath(`/dashboard/pages/${pageId}/builder`);
  revalidatePath(`/dashboard/pages/${pageId}/preview`);
  // The API route does this too; both write paths have to, or the live page
  // serves the old blocks until the cache TTL runs out.
  await revalidateWorkspaceSite(page.website.workspaceId);
  return { ok: true };
}

export async function setPageStatusAction(
  pageId: string,
  status: PageStatus
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const page = await loadEditablePage(pageId, session.user.id);
  if (!page) return { ok: false, error: "Not allowed." };

  // Tipe TypeScript tidak berlaku saat runtime: server action bisa dipanggil
  // dari browser dengan nilai apa pun.
  if (!PAGE_STATUSES.includes(status)) {
    return { ok: false, error: "Status halaman tidak dikenal." };
  }
  if (status === "PUBLISHED" && page.status !== "PUBLISHED") {
    const blocker = await publishBlocker(pageId);
    if (blocker) return { ok: false, error: blocker };
  }

  await prisma.$transaction([
    prisma.page.update({
      where: { id: pageId },
      data: {
        status,
        publishedAt:
          status === "PUBLISHED" ? page.publishedAt ?? new Date() : page.publishedAt,
      },
    }),
    ...(status !== "PUBLISHED" && page.website.homePageId === pageId
      ? [
          prisma.website.update({
            where: { id: page.websiteId },
            data: { homePageId: null },
          }),
        ]
      : []),
  ]);

  revalidatePath("/dashboard/pages");
  revalidatePath(`/dashboard/pages/${pageId}/builder`);
  revalidatePath(`/dashboard/pages/${pageId}/settings`);
  await revalidateWorkspaceSite(page.website.workspaceId);
  return { ok: true };
}

export async function setHomePageAction(pageId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const page = await loadEditablePage(pageId, session.user.id);
  if (!page) return { ok: false, error: "Not allowed." };
  if (page.status !== "PUBLISHED") {
    return {
      ok: false,
      error: "Publish this page before setting it as the homepage.",
    };
  }

  await prisma.website.update({
    where: { id: page.websiteId },
    data: { homePageId: page.id },
  });

  revalidatePath("/dashboard/pages");
  revalidatePath(`/dashboard/pages/${pageId}/settings`);
  await revalidateWorkspaceSite(page.website.workspaceId);
  return { ok: true };
}

export async function deletePageAction(pageId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const page = await loadEditablePage(pageId, session.user.id);
  if (!page) return { ok: false, error: "Not allowed." };

  await prisma.$transaction([
    ...(page.website.homePageId === pageId
      ? [
          prisma.website.update({
            where: { id: page.websiteId },
            data: { homePageId: null },
          }),
        ]
      : []),
    prisma.page.delete({ where: { id: pageId } }),
  ]);

  revalidatePath("/dashboard/pages");
  await revalidateWorkspaceSite(page.website.workspaceId);
  return { ok: true };
}

export async function updateWebsiteAction(
  websiteId: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const website = await prisma.website.findUnique({
    where: { id: websiteId },
  });
  if (!website) return { ok: false, error: "Website not found." };

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: website.workspaceId,
        userId: session.user.id,
      },
    },
  });
  if (!membership || !canInWorkspace(membership.role, "content.edit")) {
    return { ok: false, error: "Not allowed." };
  }

  const parsed = updateWebsiteSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the form for errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  await prisma.website.update({
    where: { id: websiteId },
    data: {
      name: parsed.data.name.trim(),
      description: parsed.data.description?.trim() || null,
    },
  });

  revalidatePath("/dashboard/pages");
  return { ok: true };
}
