import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { verifyPublicAccessToken } from "@/lib/public-access-token";
import { rateLimitByIp } from "@/lib/rate-limit";
import {
  ALLOWED_EVIDENCE_TYPES,
  MAX_UPLOAD_BYTES,
} from "@/lib/upload-constants";
import { reportError } from "@/lib/error-reporting";

/**
 * Accepts one evidence file for a return request, before the request itself
 * is filed. The order's signed access token is the whole authorisation — the
 * customer has no dashboard session — so this mirrors the payment-proof
 * route: token first, then type and size, then disk.
 *
 * The upload returns metadata only. The OrderRefundEvidence rows are written
 * by the return action once the refund exists, which is also what checks the
 * URL came from here.
 */

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Must stay in step with the prefix `lib/public-return-requests.ts` checks. */
const EVIDENCE_DIR = "return-evidence";

export async function POST(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  const limit = await rateLimitByIp("return-evidence", 15, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Terlalu banyak upload. Coba lagi nanti." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const formData = await request.formData().catch(() => null);
  const accessToken = String(formData?.get("accessToken") ?? "");
  const file = formData?.get("file");

  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    select: { id: true, workspaceId: true, status: true },
  });
  if (!order || !verifyPublicAccessToken(accessToken, "order", order.id)) {
    return NextResponse.json(
      { error: "Link order tidak valid." },
      { status: 403 }
    );
  }
  if (!["PAID", "PROCESSING", "COMPLETED"].includes(order.status)) {
    return NextResponse.json(
      { error: "Order ini belum bisa diajukan refund/return." },
      { status: 409 }
    );
  }

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Pilih file bukti." }, { status: 400 });
  }
  if (!ALLOWED_EVIDENCE_TYPES.includes(file.type) || !EXT_BY_TYPE[file.type]) {
    return NextResponse.json(
      { error: "Gunakan file PNG, JPG, WEBP, atau PDF." },
      { status: 415 }
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "Ukuran file maksimal 5 MB." },
      { status: 413 }
    );
  }

  const fileName = `${randomUUID()}.${EXT_BY_TYPE[file.type]}`;
  const relDir = path.join("uploads", order.workspaceId, EVIDENCE_DIR);
  const absDir = path.join(process.cwd(), "public", relDir);
  try {
    await mkdir(absDir, { recursive: true });
    await writeFile(
      path.join(absDir, fileName),
      Buffer.from(await file.arrayBuffer())
    );
  } catch (error) {
    reportError("return-evidence write failed", error);
    return NextResponse.json(
      { error: "Bukti gagal disimpan." },
      { status: 500 }
    );
  }

  const url = `/${relDir}/${fileName}`.replace(/\\/g, "/");
  const name = file.name.slice(0, 200) || fileName;
  await prisma.uploadFile.create({
    data: {
      workspaceId: order.workspaceId,
      name,
      url,
      mimeType: file.type,
      size: file.size,
    },
  });

  return NextResponse.json({
    ok: true,
    url,
    name,
    mimeType: file.type,
    size: file.size,
  });
}
