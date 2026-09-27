import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/lib/upload-constants";
import { rateLimitShared } from "@/lib/rate-limit";
import { reportError } from "@/lib/error-reporting";
import { detectFormUploadType } from "@/lib/form-upload";
import { OPEN_INVOICE_STATUSES } from "@/lib/saas-billing";

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Menyimpan bukti transfer QRIS untuk satu tagihan SaaS.
 *
 * Terpisah dari /api/upload karena unggahan ini milik akun, bukan workspace:
 * pelanggan bisa berlangganan sebelum punya workspace dengan izin edit konten,
 * dan buktinya tidak boleh masuk ke pustaka media workspace mana pun.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = await rateLimitShared(
    `billing-proof:${session.user.id}`,
    20,
    10 * 60 * 1000
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Terlalu banyak unggahan. Coba lagi nanti." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });
  }

  const invoiceId = formData.get("invoiceId");
  if (typeof invoiceId !== "string" || !invoiceId) {
    return NextResponse.json({ error: "Tagihan wajib diisi" }, { status: 400 });
  }

  const invoice = await prisma.saaSInvoice.findFirst({
    where: {
      id: invoiceId,
      userId: session.user.id,
      status: { in: [...OPEN_INVOICE_STATUSES] },
    },
    select: { id: true },
  });
  if (!invoice) {
    return NextResponse.json(
      { error: "Tagihan tidak ditemukan atau sudah ditutup" },
      { status: 404 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File belum dipilih" }, { status: 400 });
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Hanya PNG, JPG, WEBP, atau GIF" },
      { status: 415 }
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File kosong" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "Ukuran maksimal 5 MB" },
      { status: 413 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const detected = detectFormUploadType(bytes);
  if (
    !detected ||
    detected.mimeType === "application/pdf" ||
    detected.mimeType !== file.type
  ) {
    return NextResponse.json(
      { error: "Isi file tidak cocok dengan tipe gambar yang didukung" },
      { status: 415 }
    );
  }

  const ext = EXT_BY_TYPE[detected.mimeType] ?? detected.extension;
  const fileName = `${randomUUID()}.${ext}`;
  const relDir = path.join("uploads", "billing", session.user.id);
  const absDir = path.join(process.cwd(), "public", relDir);

  try {
    await mkdir(absDir, { recursive: true });
    await writeFile(path.join(absDir, fileName), bytes);
  } catch (error) {
    reportError("billing proof write failed", error);
    return NextResponse.json(
      { error: "Gagal menyimpan file" },
      { status: 500 }
    );
  }

  const url = `/${relDir}/${fileName}`.replace(/\\/g, "/");
  return NextResponse.json({ url });
}
