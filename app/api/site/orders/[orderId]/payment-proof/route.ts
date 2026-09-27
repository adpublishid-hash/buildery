import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { verifyPublicAccessToken } from "@/lib/public-access-token";
import { rateLimitByIp } from "@/lib/rate-limit";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/lib/upload-constants";
import { reportError } from "@/lib/error-reporting";

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function POST(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  const limit = await rateLimitByIp("manual-payment-proof", 8, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan. Coba lagi nanti." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const formData = await request.formData().catch(() => null);
  const accessToken = String(formData?.get("accessToken") ?? "");
  const file = formData?.get("file");
  const note = String(formData?.get("note") ?? "").trim().slice(0, 1000);
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: { payment: true },
  });
  if (!order || !verifyPublicAccessToken(accessToken, "order", order.id)) {
    return NextResponse.json({ error: "Link order tidak valid." }, { status: 403 });
  }
  if (!order.payment?.provider.startsWith("manual:")) {
    return NextResponse.json({ error: "Order ini bukan transfer manual." }, { status: 400 });
  }
  if (order.payment.status !== "PENDING") {
    return NextResponse.json({ error: "Pembayaran order sudah diproses." }, { status: 409 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Pilih gambar bukti transfer." }, { status: 400 });
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type) || !EXT_BY_TYPE[file.type]) {
    return NextResponse.json({ error: "Gunakan gambar PNG, JPG, atau WEBP." }, { status: 415 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Ukuran gambar maksimal 5 MB." }, { status: 413 });
  }

  const fileName = `${randomUUID()}.${EXT_BY_TYPE[file.type]}`;
  const relDir = path.join("uploads", order.workspaceId, "payment-proofs");
  const absDir = path.join(process.cwd(), "public", relDir);
  try {
    await mkdir(absDir, { recursive: true });
    await writeFile(path.join(absDir, fileName), Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    reportError("payment-proof write failed", error);
    return NextResponse.json({ error: "Bukti transfer gagal disimpan." }, { status: 500 });
  }

  const url = `/${relDir}/${fileName}`.replace(/\\/g, "/");
  await prisma.$transaction([
    prisma.uploadFile.create({
      data: {
        workspaceId: order.workspaceId,
        name: file.name.slice(0, 200),
        url,
        mimeType: file.type,
        size: file.size,
      },
    }),
    prisma.payment.update({
      where: { id: order.payment.id },
      data: {
        manualProofUrl: url,
        manualProofNote: note || null,
        manualProofStatus: "PENDING",
        manualProofSubmittedAt: new Date(),
        manualProofReviewedAt: null,
        manualProofReviewedById: null,
      },
    }),
  ]);
  return NextResponse.json({ ok: true, url });
}
