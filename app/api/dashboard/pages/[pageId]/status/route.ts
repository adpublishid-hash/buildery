import { NextResponse } from "next/server";

import { revalidatePublicPages } from "@/lib/public-page";
import { revalidatePath } from "next/cache";
import type { PageStatus } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { publishBlocker } from "@/lib/page-publish-guard";

const statusSchema = z.object({
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
});

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
  // The published page is served from a tagged cache; this change has to
  // drop it, or the shop keeps serving the old one until the TTL runs out.
  revalidatePublicPages(workspaceId);
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { slug: true },
  });
  if (workspace) revalidatePath(`/site/${workspace.slug}`);
}

export async function PATCH(
  req: Request,
  { params }: { params: { pageId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Session expired. Please sign in again." },
      { status: 401 }
    );
  }

  const page = await loadEditablePage(params.pageId, session.user.id);
  if (!page) {
    return NextResponse.json(
      { ok: false, error: "Not allowed." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request payload." },
      { status: 400 }
    );
  }

  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid page status." },
      { status: 400 }
    );
  }

  const status = parsed.data.status as PageStatus;
  // Hanya saat berpindah menjadi terbit. Memeriksa ulang halaman yang sudah
  // tayang akan mengunci pemiliknya dari menyunting judul SEO atau slug
  // halamannya sendiri; audit di builder yang menangani perbaikannya.
  if (status === "PUBLISHED" && page.status !== "PUBLISHED") {
    const blocker = await publishBlocker(page.id);
    if (blocker) {
      return NextResponse.json({ ok: false, error: blocker }, { status: 422 });
    }
  }
  await prisma.$transaction([
    prisma.page.update({
      where: { id: page.id },
      data: {
        status,
        publishedAt:
          status === "PUBLISHED" ? page.publishedAt ?? new Date() : page.publishedAt,
      },
    }),
    ...(status !== "PUBLISHED" && page.website.homePageId === page.id
      ? [
          prisma.website.update({
            where: { id: page.websiteId },
            data: { homePageId: null },
          }),
        ]
      : []),
  ]);

  revalidatePath("/dashboard/pages");
  revalidatePath(`/dashboard/pages/${page.id}/builder`);
  revalidatePath(`/dashboard/pages/${page.id}/settings`);
  await revalidateWorkspaceSite(page.website.workspaceId);

  return NextResponse.json({ ok: true });
}
