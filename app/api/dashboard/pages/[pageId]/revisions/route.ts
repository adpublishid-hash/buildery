import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { loadEditableBuilderPage } from "@/lib/page-builder-access";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
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

  const revisions = await prisma.pageRevision.findMany({
    where: { pageId: page.id },
    orderBy: { version: "desc" },
    take: 50,
    select: {
      id: true,
      version: true,
      source: true,
      blocks: true,
      blockCount: true,
      createdAt: true,
      createdBy: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json({ ok: true, data: revisions });
}
