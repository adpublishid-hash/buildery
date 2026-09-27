import type { Prisma } from "@prisma/client";

import type { Block, FooterData, HeaderData } from "@/lib/blocks/schema";
import { footerDataSchema, headerDataSchema } from "@/lib/blocks/schema";

/**
 * Header dan footer situs — "chrome" yang dipakai bersama semua halaman.
 *
 * Sebelumnya setiap halaman membawa blok Header dan Footer-nya sendiri.
 * Section tersimpan pun disisipkan sebagai salinan tanpa tautan balik, jadi
 * mengganti satu tautan menu berarti menyunting setiap halaman satu per satu,
 * dan lama-lama header antar halaman saling berbeda.
 *
 * Blok bertanda `siteWide` tidak lagi memegang isinya sendiri: isinya dibaca
 * dari `Website.siteHeader`/`siteFooter` saat dirender, dan ditulis balik ke
 * sana saat disimpan. Blok tanpa tanda itu bekerja persis seperti dulu.
 *
 * Murni dan tanpa dependensi server supaya bisa diuji dan dipakai di builder.
 */

export type SiteChrome = {
  header: HeaderData | null;
  footer: FooterData | null;
};

/** Membaca kolom JSON tersimpan; data rusak diperlakukan sebagai belum ada. */
export function parseSiteChrome(value: {
  siteHeader?: Prisma.JsonValue | null;
  siteFooter?: Prisma.JsonValue | null;
}): SiteChrome {
  const header = value.siteHeader
    ? headerDataSchema.safeParse(value.siteHeader)
    : null;
  const footer = value.siteFooter
    ? footerDataSchema.safeParse(value.siteFooter)
    : null;
  return {
    header: header?.success ? header.data : null,
    footer: footer?.success ? footer.data : null,
  };
}

function isSiteWide(block: Block): boolean {
  return (
    (block.type === "HEADER" || block.type === "FOOTER") &&
    Boolean((block.data as { siteWide?: boolean }).siteWide)
  );
}

/**
 * Mengganti isi blok bertanda `siteWide` dengan versi situs. Dipakai saat
 * merender halaman publik dan saat memuat builder, supaya yang diedit dan yang
 * tayang selalu versi yang sama.
 *
 * Kalau versi situs belum ada, isi blok itu sendiri yang dipakai — halaman
 * pertama yang menandai headernya `siteWide` otomatis menjadi sumbernya.
 */
export function applySiteChrome<T extends Block>(
  blocks: T[],
  chrome: SiteChrome
): T[] {
  return blocks.map((block) => {
    if (!isSiteWide(block)) return block;
    const shared = block.type === "HEADER" ? chrome.header : chrome.footer;
    if (!shared) return block;
    return { ...block, data: { ...shared, siteWide: true } } as T;
  });
}

/**
 * Versi situs yang harus disimpan dari satu set blok yang baru disimpan.
 *
 * Mengembalikan hanya bagian yang berubah — header saja, footer saja, atau
 * keduanya — supaya menyimpan halaman tanpa header situs tidak menghapus
 * header situs milik halaman lain.
 */
export function extractSiteChrome(blocks: Block[]): Partial<SiteChrome> {
  const out: Partial<SiteChrome> = {};
  for (const block of blocks) {
    if (!isSiteWide(block)) continue;
    // Kalau satu halaman memuat lebih dari satu, yang terakhir menang —
    // sama dengan urutan tampilnya.
    if (block.type === "HEADER") {
      out.header = { ...(block.data as HeaderData), siteWide: true };
    } else {
      out.footer = { ...(block.data as FooterData), siteWide: true };
    }
  }
  return out;
}

/** Apakah halaman ini membawa footernya sendiri (blok Footer apa pun). */
export function hasFooterBlock(blocks: Block[]): boolean {
  return blocks.some((block) => block.type === "FOOTER");
}

/** JSON dengan kunci terurut, supaya data yang sama selalu menghasilkan string yang sama. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Sidik jari satu versi header/footer situs (FNV-1a 32-bit atas JSON kanonis).
 *
 * Dipakai sebagai "versi dasar": builder mengirim sidik jari versi situs yang
 * dimuatnya, dan server hanya menulis balik kalau versi situs saat ini masih
 * sama. Tanpa itu, autosave dari tab yang dibuka sebelum header situs diubah
 * akan diam-diam mengembalikan perubahan itu — cukup dengan mengedit hal lain
 * di halaman tersebut.
 */
export function siteChromeFingerprint(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = canonical(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export type SiteChromeBase = {
  header?: string | null;
  footer?: string | null;
};

export type SiteChromeWrite = {
  /** Bagian yang boleh ditulis ke Website. */
  write: Partial<SiteChrome>;
  /** Bagian yang diedit di halaman ini, tapi versi situsnya sudah berubah. */
  conflicts: ("header" | "footer")[];
};

/**
 * Memutuskan bagian mana dari header/footer situs yang boleh ditulis dari satu
 * simpanan halaman.
 *
 * - Isi sama dengan versi dasar → halaman ini tidak mengeditnya; jangan tulis.
 *   Menulisnya berarti menimpa perubahan dari halaman lain dengan salinan lama.
 * - Isi berbeda, dan versi situs saat ini masih sama dengan versi dasar →
 *   perubahan sah dari halaman ini; tulis.
 * - Isi berbeda, tapi versi situs sudah berubah sejak dimuat → konflik; jangan
 *   tulis, dan laporkan supaya builder bisa memberi tahu pemiliknya.
 */
export function planSiteChromeWrite(
  incoming: Partial<SiteChrome>,
  current: SiteChrome,
  base: SiteChromeBase
): SiteChromeWrite {
  const write: Partial<SiteChrome> = {};
  const conflicts: ("header" | "footer")[] = [];

  for (const part of ["header", "footer"] as const) {
    const next = incoming[part];
    if (!next) continue;

    const nextPrint = siteChromeFingerprint(next);
    const basePrint = base[part] ?? null;
    if (nextPrint === basePrint) continue;

    const currentPrint = siteChromeFingerprint(current[part]);
    if (currentPrint === basePrint || currentPrint === nextPrint) {
      write[part] = next as never;
    } else {
      conflicts.push(part);
    }
  }
  return { write, conflicts };
}
