import { NextResponse } from "next/server";

import { revalidatePublicPages } from "@/lib/public-page";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { builderDesignTokensSchema } from "@/lib/builder-design-tokens";
import { loadEditableBuilderPage } from "@/lib/page-builder-access";
import { prisma } from "@/lib/prisma";

export async function PUT(
  req: Request,
  { params }: { params: { pageId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Session expired." }, { status: 401 });
  }
  const page = await loadEditableBuilderPage(params.pageId, session.user.id);
  if (!page) {
    return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
  }
  const parsed = builderDesignTokensSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid design tokens." }, { status: 400 });
  }
  await prisma.website.update({
    where: { id: page.websiteId },
    data: { designTokens: parsed.data },
  });
  revalidatePublicPages(page.website.workspaceId);
  const workspace = await prisma.workspace.findUnique({
    where: { id: page.website.workspaceId },
    select: { slug: true },
  });
  revalidatePath(`/dashboard/pages/${page.id}/builder`);
  if (workspace) revalidatePath(`/site/${workspace.slug}`);
  return NextResponse.json({ ok: true, data: parsed.data });
}
