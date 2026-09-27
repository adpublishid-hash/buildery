import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { customHtmlDataSchema } from "@/lib/blocks/schema";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace";

export async function GET(
  _req: Request,
  { params }: { params: { templateId: string } }
) {
  const current = await loadCurrentEditableWorkspace();
  if (!current.ok) return current.response;

  const template = await prisma.htmlTemplate.findFirst({
    where: { id: params.templateId, workspaceId: current.workspaceId },
    select: {
      id: true,
      name: true,
      description: true,
      data: true,
      assetCount: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!template) {
    return NextResponse.json(
      { ok: false, error: "Template not found." },
      { status: 404 }
    );
  }

  const data = customHtmlDataSchema.parse(template.data ?? {});
  return NextResponse.json({ ok: true, template: { ...template, data } });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { templateId: string } }
) {
  const current = await loadCurrentEditableWorkspace();
  if (!current.ok) return current.response;

  const template = await prisma.htmlTemplate.findFirst({
    where: { id: params.templateId, workspaceId: current.workspaceId },
    select: { id: true },
  });
  if (!template) {
    return NextResponse.json(
      { ok: false, error: "Template not found." },
      { status: 404 }
    );
  }

  await prisma.htmlTemplate.delete({ where: { id: template.id } });
  return NextResponse.json({ ok: true });
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
