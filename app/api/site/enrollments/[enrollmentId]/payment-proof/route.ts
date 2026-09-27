import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { getMemberSession } from "@/lib/member-auth";
import { prisma } from "@/lib/prisma";
import { verifyPublicAccessToken } from "@/lib/public-access-token";
import { rateLimitByIp } from "@/lib/rate-limit";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/lib/upload-constants";

const EXTENSION: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function POST(request: NextRequest, { params }: { params: { enrollmentId: string } }) {
  const limit = await rateLimitByIp("course-payment-proof", 8, 15 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  const member = await getMemberSession();
  const data = await request.formData().catch(() => null);
  const accessToken = String(data?.get("accessToken") ?? "");
  const file = data?.get("file");
  const note = String(data?.get("note") ?? "").trim().slice(0, 1000);
  const enrollment = await prisma.enrollment.findUnique({ where: { id: params.enrollmentId }, include: { payment: true } });
  if (!member || !enrollment || enrollment.customerId !== member.customerId || enrollment.workspaceId !== member.workspaceId || !enrollment.payment || !verifyPublicAccessToken(accessToken, "payment", enrollment.payment.id)) {
    return NextResponse.json({ error: "Invalid payment link." }, { status: 403 });
  }
  if (!enrollment.payment.provider.startsWith("manual:") || enrollment.payment.status !== "PENDING") return NextResponse.json({ error: "Payment cannot accept a receipt." }, { status: 409 });
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Choose a receipt image." }, { status: 400 });
  if (!ALLOWED_IMAGE_TYPES.includes(file.type) || !EXTENSION[file.type]) return NextResponse.json({ error: "Use PNG, JPG, or WEBP." }, { status: 415 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Image must be 5 MB or smaller." }, { status: 413 });
  const filename = `${randomUUID()}.${EXTENSION[file.type]}`;
  const relDir = path.join("uploads", enrollment.workspaceId, "course-payment-proofs");
  const directory = path.join(process.cwd(), "public", relDir);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), Buffer.from(await file.arrayBuffer()));
  const url = `/${relDir}/${filename}`.replace(/\\/g, "/");
  await prisma.$transaction([
    prisma.uploadFile.create({ data: { workspaceId: enrollment.workspaceId, name: file.name.slice(0, 200), url, mimeType: file.type, size: file.size } }),
    prisma.payment.update({ where: { id: enrollment.payment.id }, data: { manualProofUrl: url, manualProofNote: note || null, manualProofStatus: "PENDING", manualProofSubmittedAt: new Date(), manualProofReviewedAt: null, manualProofReviewedById: null } }),
  ]);
  return NextResponse.json({ ok: true });
}
