import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { rateLimitByIp } from "@/lib/rate-limit";
import { getCurrentWorkspace } from "@/lib/workspace";
import { reportError } from "@/lib/error-reporting";

const MAX_TEMPLATE_ASSET_BYTES = 8 * 1024 * 1024;
const TEMPLATE_ID_RE = /^[a-zA-Z0-9_-]{8,80}$/;
const ALLOWED_ASSET_TYPES: Record<string, string[]> = {
  eot: ["application/vnd.ms-fontobject", "application/octet-stream"],
  gif: ["image/gif"],
  jpeg: ["image/jpeg"],
  jpg: ["image/jpeg"],
  mp4: ["video/mp4"],
  otf: ["font/otf", "application/octet-stream"],
  png: ["image/png"],
  svg: ["image/svg+xml"],
  ttf: ["font/ttf", "application/octet-stream"],
  webm: ["video/webm"],
  webp: ["image/webp"],
  woff: ["font/woff", "application/font-woff", "application/octet-stream"],
  woff2: ["font/woff2", "application/octet-stream"],
};

export async function POST(req: NextRequest) {
  const limit = await rateLimitByIp("html-template-assets", 180, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many template asset uploads. Slow down a moment." },
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
  const templateId = String(formData.get("templateId") ?? "");
  const rawPath = String(formData.get("path") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!TEMPLATE_ID_RE.test(templateId)) {
    return NextResponse.json({ error: "Invalid template id" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_TEMPLATE_ASSET_BYTES) {
    return NextResponse.json(
      { error: "Template asset must be 8 MB or smaller" },
      { status: 413 }
    );
  }

  const safePath = sanitizeAssetPath(rawPath || file.name);
  if (!safePath) {
    return NextResponse.json({ error: "Invalid asset path" }, { status: 400 });
  }

  const ext = extensionOf(safePath);
  const allowedTypes = ALLOWED_ASSET_TYPES[ext];
  if (!allowedTypes) {
    return NextResponse.json(
      { error: "Template asset type is not allowed" },
      { status: 415 }
    );
  }
  if (file.type && !allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: "Template asset MIME type is not allowed" },
      { status: 415 }
    );
  }

  const workspaceId = current.workspace.id;
  const relDirParts = ["uploads", workspaceId, "html-templates", templateId];
  const relPath = [...relDirParts, ...safePath.split("/")].join("/");
  const baseAbs = path.resolve(process.cwd(), "public", ...relDirParts);
  const absPath = path.resolve(baseAbs, ...safePath.split("/"));

  if (!absPath.startsWith(baseAbs + path.sep)) {
    return NextResponse.json({ error: "Invalid asset path" }, { status: 400 });
  }

  try {
    await mkdir(path.dirname(absPath), { recursive: true });
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(absPath, bytes);
  } catch (error) {
    reportError("html-template-assets write failed", error);
    return NextResponse.json({ error: "Could not store asset" }, { status: 500 });
  }

  const publicUrl = `/${relPath}`.replace(/\\/g, "/");
  const record = await prisma.uploadFile.create({
    data: {
      workspaceId,
      uploadedById: session.user.id,
      name: safePath.slice(-200),
      url: publicUrl,
      mimeType: file.type || allowedTypes[0],
      size: file.size,
    },
  });

  return NextResponse.json({
    id: record.id,
    url: record.url,
    name: record.name,
  });
}

function sanitizeAssetPath(value: string) {
  const normalized = value
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  if (normalized.length === 0 || normalized.length > 12) return "";
  if (normalized.some((part) => part === "." || part === "..")) return "";

  const safeParts = normalized.map((part) =>
    part.replace(/[^a-zA-Z0-9._ -]/g, "-").replace(/\s+/g, "-")
  );
  if (safeParts.some((part) => !part || part.startsWith("."))) return "";

  const safePath = safeParts.join("/");
  return safePath.length <= 500 ? safePath : "";
}

function extensionOf(value: string) {
  return value.split(".").pop()?.toLowerCase() ?? "";
}
