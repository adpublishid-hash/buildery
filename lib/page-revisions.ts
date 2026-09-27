import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Berapa banyak simpanan otomatis yang disimpan per halaman.
 *
 * Autosave berjalan 1,8 detik setelah pengetikan berhenti, jadi satu sesi
 * menggarap serius bisa menghasilkan ratusan revisi. Dulu pemangkasan hanya
 * menyimpan 100 versi terakhir tanpa membedakan sumbernya, sehingga autosave
 * menggusur habis versi manual dan versi terbit dari kemarin — justru versi
 * yang ingin dikembalikan orang.
 */
export const AUTOSAVE_KEEP = 20;

/** Checkpoint yang dibuat sengaja: disimpan manual, diterbitkan, dikembalikan. */
export const CHECKPOINT_KEEP = 80;

const CHECKPOINT_SOURCES = ["MANUAL", "PUBLISH", "RESTORE"] as const;

export type PruneSummary = { autosaves: number; checkpoints: number };

/**
 * Memangkas riwayat revisi satu halaman, menghitung autosave dan checkpoint
 * dalam kuota terpisah supaya keduanya tidak saling menggusur.
 */
export async function prunePageRevisions(
  tx: Tx,
  pageId: string
): Promise<PruneSummary> {
  const summary: PruneSummary = { autosaves: 0, checkpoints: 0 };

  const staleAutosaves = await tx.pageRevision.findMany({
    where: { pageId, source: "AUTOSAVE" },
    orderBy: { version: "desc" },
    skip: AUTOSAVE_KEEP,
    select: { id: true },
  });
  if (staleAutosaves.length > 0) {
    const deleted = await tx.pageRevision.deleteMany({
      where: { id: { in: staleAutosaves.map((row) => row.id) } },
    });
    summary.autosaves = deleted.count;
  }

  const staleCheckpoints = await tx.pageRevision.findMany({
    where: { pageId, source: { in: [...CHECKPOINT_SOURCES] } },
    orderBy: { version: "desc" },
    skip: CHECKPOINT_KEEP,
    select: { id: true },
  });
  if (staleCheckpoints.length > 0) {
    const deleted = await tx.pageRevision.deleteMany({
      where: { id: { in: staleCheckpoints.map((row) => row.id) } },
    });
    summary.checkpoints = deleted.count;
  }

  return summary;
}
