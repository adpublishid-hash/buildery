import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { listBuilderTemplates } from "@/lib/site-templates";

/**
 * Daftar template untuk builder: bawaan kode plus yang dikurasi admin.
 *
 * Sebelumnya builder hanya membaca array hardcode, jadi halaman template di
 * admin mengelola data yang tidak pernah dibaca siapa pun.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sesi berakhir." },
      { status: 401 }
    );
  }

  const templates = await listBuilderTemplates();
  return NextResponse.json({ ok: true, data: templates });
}
