import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { resolvePrivateFormUpload } from "@/lib/form-upload";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { submissionId: string; field: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const submission = await prisma.formSubmission.findUnique({
    where: { id: params.submissionId },
    select: { workspaceId: true, data: true },
  });
  if (!submission) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: submission.workspaceId,
        userId: session.user.id,
      },
    },
    select: { role: true },
  });
  if (!membership || !canInWorkspace(membership.role, "content.view")) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const data = submission.data as Record<string, unknown>;
  const value = data[decodeURIComponent(params.field)];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  const file = value as Record<string, unknown>;
  const storageKey =
    typeof file.storageKey === "string" ? file.storageKey : "";
  const absolutePath = resolvePrivateFormUpload(storageKey);
  if (!absolutePath) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  try {
    const bytes = await readFile(absolutePath);
    const mimeType =
      typeof file.mimeType === "string"
        ? file.mimeType
        : "application/octet-stream";
    const originalName =
      typeof file.name === "string" && file.name ? file.name : "attachment";
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(
          originalName
        )}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
