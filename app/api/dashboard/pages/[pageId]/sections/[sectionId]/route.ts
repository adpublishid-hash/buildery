import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { loadEditableBuilderPage } from "@/lib/page-builder-access";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  { params }: { params: { pageId: string; sectionId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Session expired." }, { status: 401 });
  }
  const page = await loadEditableBuilderPage(params.pageId, session.user.id);
  if (!page) {
    return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
  }
  const deleted = await prisma.savedSection.deleteMany({
    where: { id: params.sectionId, workspaceId: page.website.workspaceId },
  });
  if (!deleted.count) {
    return NextResponse.json({ ok: false, error: "Section not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
