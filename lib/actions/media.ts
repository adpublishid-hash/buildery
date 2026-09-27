"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireWorkspacePermission } from "@/lib/workspace";
import { deleteOrphanUpload } from "@/lib/upload-cleanup";

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/**
 * Menghapus satu berkas dari pustaka media.
 *
 * deleteOrphanUpload menolak menghapus apa pun yang masih dirujuk produk,
 * kursus, blog, blok halaman, revisi, section tersimpan, atau template — jadi
 * tombol hapus di sini tidak bisa memutus gambar yang masih tayang.
 */
export async function deleteMediaAction(
  uploadId: string
): Promise<ActionResult> {
  const { workspace } = await requireWorkspacePermission("content.edit");

  const upload = await prisma.uploadFile.findFirst({
    where: { id: uploadId, workspaceId: workspace.id },
    select: { id: true },
  });
  if (!upload) return { ok: false, error: "Berkas tidak ditemukan." };

  const removed = await deleteOrphanUpload(upload.id);
  if (!removed) {
    return {
      ok: false,
      error:
        "Berkas ini masih dipakai di halaman, produk, atau konten lain, jadi tidak dihapus.",
    };
  }

  revalidatePath("/dashboard/media");
  return { ok: true };
}
