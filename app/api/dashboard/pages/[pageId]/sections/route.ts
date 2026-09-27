import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { pageBlocksSchema } from "@/lib/blocks/schema";
import { loadEditableBuilderPage } from "@/lib/page-builder-access";
import { prisma } from "@/lib/prisma";

const createSectionSchema = z.object({
  name: z.string().trim().min(2).max(80),
  blocks: pageBlocksSchema.min(1).max(20),
});

async function access(pageId: string, userId: string) {
  return loadEditableBuilderPage(pageId, userId);
}

export async function GET(
  _req: Request,
  { params }: { params: { pageId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Session expired." }, { status: 401 });
  }
  const page = await access(params.pageId, session.user.id);
  if (!page) {
    return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
  }
  const sections = await prisma.savedSection.findMany({
    where: { workspaceId: page.website.workspaceId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, blocks: true, blockCount: true, updatedAt: true },
  });
  return NextResponse.json({ ok: true, data: sections });
}

export async function POST(
  req: Request,
  { params }: { params: { pageId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Session expired." }, { status: 401 });
  }
  const page = await access(params.pageId, session.user.id);
  if (!page) {
    return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
  }
  const parsed = createSectionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid section data." }, { status: 400 });
  }
  const duplicate = await prisma.savedSection.findUnique({
    where: {
      workspaceId_name: {
        workspaceId: page.website.workspaceId,
        name: parsed.data.name,
      },
    },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json(
      { ok: false, error: "A reusable section with that name already exists." },
      { status: 409 }
    );
  }
  const section = await prisma.savedSection.create({
    data: {
      workspaceId: page.website.workspaceId,
      name: parsed.data.name,
      blocks: parsed.data.blocks,
      blockCount: parsed.data.blocks.length,
      createdById: session.user.id,
    },
    select: { id: true, name: true, blocks: true, blockCount: true, updatedAt: true },
  });
  return NextResponse.json({ ok: true, data: section }, { status: 201 });
}
