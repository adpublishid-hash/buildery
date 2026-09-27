import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { isSuperAdminEmail } from "@/lib/super-admin";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/lib/upload-constants";
import { reportError } from "@/lib/error-reporting";
import { detectFormUploadType } from "@/lib/form-upload";

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Menyimpan gambar QRIS platform ke disk sendiri.
 *
 * Ada supaya QR tidak perlu menumpang domain lain: QR yang di-hosting pihak
 * ketiga ikut mati saat domain itu berubah, dan pembayaran berhenti tanpa
 * peringatan apa pun.
 *
 * Tidak memakai requireSuperAdmin(): guard itu memanggil redirect(), yang
 * cocok untuk halaman, bukan untuk route handler yang harus membalas JSON.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (
    !session?.user ||
    session.user.role !== "SUPER_ADMIN" ||
    !isSuperAdminEmail(session.user.email)
  ) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });
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
    return NextResponse.json({ error: "Ukuran maksimal 5 MB" }, { status: 413 });
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
  const fileName = `qris-${randomUUID()}.${ext}`;
  const relDir = path.join("uploads", "billing", "qris");
  const absDir = path.join(process.cwd(), "public", relDir);

  try {
    await mkdir(absDir, { recursive: true });
    await writeFile(path.join(absDir, fileName), bytes);
  } catch (error) {
    reportError("qris upload write failed", error);
    return NextResponse.json({ error: "Gagal menyimpan file" }, { status: 500 });
  }

  const url = `/${relDir}/${fileName}`.replace(/\\/g, "/");
  return NextResponse.json({ url });
}
