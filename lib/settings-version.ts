/**
 * Penanda versi baris pengaturan, dipakai untuk mendeteksi penyimpanan yang
 * berangkat dari data basi.
 *
 * Terpisah dari lib/settings-audit.ts karena form pengaturan adalah komponen
 * client dan harus bisa mengirim field ini; modul audit server-only tidak bisa
 * diimpor dari sana.
 *
 * Client-safe: tidak ada import server.
 */

/** Nama field tersembunyi yang membawa versi baris saat form dimuat. */
export const SETTINGS_VERSION_FIELD = "__loadedAt";

export const STALE_WRITE_MESSAGE =
  "Pengaturan ini sudah diubah orang lain sejak halaman dibuka. Muat ulang halaman supaya perubahan mereka tidak tertimpa.";

/**
 * Apakah baris sudah berubah sejak form ini dimuat.
 *
 * Form pengaturan itu besar — integrasi punya puluhan field di balik satu
 * tombol simpan. Tanpa pemeriksaan ini, dua admin yang menyimpan bersamaan
 * membuat yang belakangan menimpa seluruh perubahan yang pertama, diam-diam.
 *
 * Form lama yang belum mengirim versi tetap dibiarkan lewat: tidak mengunci
 * lebih baik daripada menolak simpanan yang sah.
 */
export function isStaleSettingsWrite(
  submitted: FormDataEntryValue | null | undefined,
  currentUpdatedAt: Date | null | undefined
): boolean {
  const raw = String(submitted ?? "").trim();
  if (!raw || !currentUpdatedAt) return false;

  const loadedAt = new Date(raw);
  if (Number.isNaN(loadedAt.getTime())) return false;

  // Satu detik toleransi: presisi timestamp bisa berbeda antara serialisasi
  // dan pembacaan ulang, dan selisih sekecil itu bukan konflik sungguhan.
  return currentUpdatedAt.getTime() - loadedAt.getTime() > 1000;
}
