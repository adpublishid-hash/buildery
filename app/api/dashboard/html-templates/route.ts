import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { customHtmlDataSchema } from "@/lib/blocks/schema";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace";

const saveTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(280).optional().default(""),
  data: customHtmlDataSchema,
  assetCount: z.coerce.number().int().min(0).max(500).default(0),
});

export async function GET() {
  const current = await loadCurrentEditableWorkspace();
  if (!current.ok) return current.response;

  const templates = await prisma.htmlTemplate.findMany({
    where: { workspaceId: current.workspaceId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      assetCount: true,
      createdAt: true,
      updatedAt: true,
    },
    take: 50,
  });

  return NextResponse.json({ ok: true, templates });
}

export async function POST(req: Request) {
  const current = await loadCurrentEditableWorkspace();
  if (!current.ok) return current.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request payload." },
      { status: 400 }
    );
  }

  const parsed = saveTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Template content is invalid." },
      { status: 400 }
    );
  }

  const template = await prisma.htmlTemplate.create({
    data: {
      workspaceId: current.workspaceId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      data: parsed.data.data as Prisma.InputJsonValue,
      assetCount: parsed.data.assetCount,
    },
    select: {
      id: true,
      name: true,
      description: true,
      assetCount: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, template });
}

async function loadCurrentEditableWorkspace() {
  const session = await auth();
  if (!session?.user) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Session expired. Please sign in again." },
        { status: 401 }
      ),
    };
  }

  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Not allowed." },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, workspaceId: current.workspace.id };
}
