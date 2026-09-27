import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { getCurrentWorkspace } from "@/lib/workspace";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/lib/upload-constants";
import { rateLimitByIp } from "@/lib/rate-limit";
import { reportError } from "@/lib/error-reporting";
import { detectFormUploadType } from "@/lib/form-upload";

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Stores an uploaded image on the local VPS disk under /public/uploads and
 * records its metadata as an UploadFile row.
 */
export async function POST(req: NextRequest) {
  // 30 uploads per minute per IP.
  const limit = await rateLimitByIp("upload", 30, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many uploads. Slow down a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Only PNG, JPG, WEBP, or GIF images are allowed" },
      { status: 415 }
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "Image must be 5 MB or smaller" },
      { status: 413 }
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const detected = detectFormUploadType(bytes);
  if (
    !detected ||
    detected.mimeType === "application/pdf" ||
    detected.mimeType !== file.type
  ) {
    return NextResponse.json(
      { error: "File contents do not match a supported image type" },
      { status: 415 }
    );
  }

  const workspaceId = current.workspace.id;
  const ext = EXT_BY_TYPE[detected.mimeType] ?? detected.extension;
  const fileName = `${randomUUID()}.${ext}`;
  const relDir = path.join("uploads", workspaceId);
  const absDir = path.join(process.cwd(), "public", relDir);

  const absPath = path.join(absDir, fileName);
  try {
    await mkdir(absDir, { recursive: true });
    await writeFile(absPath, bytes);
  } catch (error) {
    reportError("upload write failed", error);
    return NextResponse.json({ error: "Could not store file" }, { status: 500 });
  }

  const publicUrl = `/${relDir}/${fileName}`.replace(/\\/g, "/");

  let record;
  try {
    record = await prisma.uploadFile.create({
      data: {
        workspaceId,
        uploadedById: session.user.id,
        name: file.name.slice(0, 200),
        url: publicUrl,
        mimeType: detected.mimeType,
        size: file.size,
      },
    });
  } catch (error) {
    await unlink(absPath).catch(() => {});
    reportError("upload metadata write failed", error);
    return NextResponse.json({ error: "Could not store file" }, { status: 500 });
  }

  return NextResponse.json({
    id: record.id,
    url: record.url,
    name: record.name,
  });
}
