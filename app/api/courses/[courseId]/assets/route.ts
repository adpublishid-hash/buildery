import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { rateLimitByIp } from "@/lib/rate-limit";
import { getCurrentWorkspace } from "@/lib/workspace";

const ALLOWED: Record<string, { extension: string; kind: "VIDEO" | "PDF" | "ATTACHMENT" }> = {
  "video/mp4": { extension: "mp4", kind: "VIDEO" },
  "video/webm": { extension: "webm", kind: "VIDEO" },
  "application/pdf": { extension: "pdf", kind: "PDF" },
  "application/zip": { extension: "zip", kind: "ATTACHMENT" },
  "text/plain": { extension: "txt", kind: "ATTACHMENT" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { extension: "docx", kind: "ATTACHMENT" },
};

const MAX_BYTES = 200 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const limit = await rateLimitByIp("course-asset-upload", 10, 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: "Too many uploads." }, { status: 429 });
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const course = await prisma.course.findFirst({
    where: { id: params.courseId, workspaceId: current.workspace.id },
    select: { id: true },
  });
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a file first." }, { status: 400 });
  }
  const allowed = ALLOWED[file.type];
  if (!allowed) return NextResponse.json({ error: "Unsupported course file type." }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File must be 200 MB or smaller." }, { status: 413 });

  const filename = `${randomUUID()}.${allowed.extension}`;
  const storageKey = path.join(current.workspace.id, course.id, filename);
  const directory = path.join(process.cwd(), "private", "course-assets", current.workspace.id, course.id);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), Buffer.from(await file.arrayBuffer()));
  const asset = await prisma.courseAsset.create({
    data: { courseId: course.id, name: file.name.slice(0, 200), storageKey, mimeType: file.type, size: file.size, kind: allowed.kind },
  });
  return NextResponse.json({ id: asset.id, name: asset.name, kind: asset.kind, size: asset.size });
}
