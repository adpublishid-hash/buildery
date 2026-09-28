import "server-only";

import { prisma } from "@/lib/prisma";
import { countCertainWhatsappPlaceholders } from "@/lib/builder-audit";
import { isBlockHidden } from "@/lib/blocks/style";

/**
 * Pemeriksaan terakhir sebelum sebuah halaman boleh terbit.
 *
 * Dua jalur menerbitkan halaman — tombol status dan form pengaturan halaman —
 * dan keduanya dulu hanya menolak halaman kosong. Audit di builder bisa
 * memperingatkan hal lain, tapi peringatan mudah dilewati, dan satu kasus
 * terlalu mahal untuk dilewati: tombol WhatsApp yang masih memakai nomor
 * contoh dari template. Nomor itu sah secara format dan bisa saja milik orang
 * sungguhan, jadi chat pembeli akan terkirim kepadanya.
 *
 * Mengembalikan pesan penolakan, atau null bila halaman boleh terbit.
 */
export async function publishBlocker(pageId: string): Promise<string | null> {
  const blocks = await prisma.pageBlock.findMany({
    where: { pageId },
    select: { type: true, data: true },
  });

  if (blocks.length === 0) {
    return "Tambahkan setidaknya satu blok sebelum terbit.";
  }
  // Blok tersembunyi tidak pernah dirender publik.
  if (blocks.every((block) => isBlockHidden(block.data))) {
    return "Semua blok disembunyikan. Tampilkan setidaknya satu blok sebelum terbit.";
  }

  const placeholders = countCertainWhatsappPlaceholders(blocks);
  if (placeholders > 0) {
    return `${placeholders} tombol WhatsApp masih memakai nomor contoh. Ganti dengan nomor bisnismu sebelum terbit — nomor contoh bisa milik orang lain, dan chat pembelimu akan terkirim ke sana.`;
  }

  return null;
}
