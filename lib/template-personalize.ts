import {
  isCertainWhatsappPlaceholder,
  whatsappFloatIssue,
} from "@/lib/builder-audit";

/**
 * Menyesuaikan blok template dengan workspace yang mengimpornya.
 *
 * Template membawa tombol WhatsApp dengan nomor placeholder. Kalau workspace
 * sudah mengatur nomor WhatsApp bisnisnya, nomor itulah yang dipasang, jadi
 * template langsung berfungsi tanpa perlu mencari setiap tombol satu per satu.
 * Kalau belum, placeholder dibiarkan: penerbitan akan ditolak sampai diganti,
 * dan itu jauh lebih aman daripada menebak nomor.
 *
 * Murni dan tanpa dependensi server supaya mudah diuji.
 */

/** Menjadikan 08xx / +62xx / 62xx sebagai format wa.me (62xx), atau null. */
export function normalizeWhatsappNumber(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return null;
}

function replaceWhatsappNumber(href: string, number: string): string {
  if (!isCertainWhatsappPlaceholder(href)) return href;
  // Pertahankan query seperti ?text=... yang sudah disiapkan template.
  const query = href.includes("?") ? href.slice(href.indexOf("?")) : "";
  if (/^tel:/i.test(href)) return `tel:+${number}`;
  return `https://wa.me/${number}${query}`;
}

function walk(value: unknown, number: string): unknown {
  if (Array.isArray(value)) return value.map((item) => walk(item, number));
  if (!value || typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] =
      key.toLowerCase().endsWith("href") && typeof entry === "string"
        ? replaceWhatsappNumber(entry, number)
        : walk(entry, number);
  }
  return out;
}

export type PersonalizeResult<T> = {
  blocks: T[];
  /** Banyaknya tautan yang nomornya sudah diganti. */
  replaced: number;
  /** Banyaknya tautan yang masih placeholder karena nomor belum diatur. */
  remaining: number;
};

/** Blok Tombol WhatsApp menyimpan nomornya di `phone`, bukan di tautan. */
function floatNeedsNumber(block: { type?: string; data: unknown }): boolean {
  return (
    block.type === "WHATSAPP_FLOAT" &&
    whatsappFloatIssue((block.data as { phone?: string }).phone) !== null
  );
}

export function personalizeTemplateBlocks<T extends { type?: string; data: unknown }>(
  blocks: T[],
  whatsappNumber: string | null | undefined
): PersonalizeResult<T> {
  const count = (list: T[]) =>
    (JSON.stringify(list.map((block) => block.data))
      .match(/https?:\/\/(?:wa\.me|api\.whatsapp\.com)[^"]*/gi)
      ?.filter(isCertainWhatsappPlaceholder).length ?? 0) +
    list.filter(floatNeedsNumber).length;

  const before = count(blocks);
  const number = normalizeWhatsappNumber(whatsappNumber);
  if (!number || before === 0) {
    return { blocks, replaced: 0, remaining: before };
  }

  const personalized = blocks.map((block) => {
    const data = walk(block.data, number) as Record<string, unknown>;
    return {
      ...block,
      data: floatNeedsNumber(block) ? { ...data, phone: number } : data,
    };
  });
  const after = count(personalized);
  return { blocks: personalized, replaced: before - after, remaining: after };
}

export type ProtectResult<T> = {
  blocks: T[];
  /** Tautan yang diarahkan ke nomor bisnis workspace. */
  substituted: number;
  /** Tautan yang dinonaktifkan karena workspace belum punya nomor. */
  neutralized: number;
};

function neutralize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(neutralize);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] =
      key.toLowerCase().endsWith("href") &&
      typeof entry === "string" &&
      isCertainWhatsappPlaceholder(entry)
        ? "#"
        : neutralize(entry);
  }
  return out;
}

/**
 * Pengaman untuk halaman yang sudah tayang.
 *
 * Penjaga penerbitan hanya mencegah halaman *baru* terbit dengan nomor
 * WhatsApp contoh. Halaman yang terbit sebelum penjaga itu ada masih
 * mengarahkan chat pembeli ke nomor yang bisa saja milik orang lain.
 *
 * Saat halaman publik dirender: kalau workspace sudah mengatur nomor bisnis,
 * tautan diarahkan ke sana; kalau belum, tautannya dinonaktifkan dan tombol
 * WhatsApp mengambang disembunyikan. Tombol mati jauh lebih baik daripada
 * chat pembeli yang terkirim ke orang asing.
 *
 * Data tersimpan tidak diubah — builder tetap menampilkan nomor aslinya,
 * lengkap dengan peringatan merah, supaya pemilik situs bisa memperbaikinya.
 */
export function protectWhatsappPlaceholders<T extends { type?: string; data: unknown }>(
  blocks: T[],
  whatsappNumber: string | null | undefined
): ProtectResult<T> {
  const personalized = personalizeTemplateBlocks(blocks, whatsappNumber);
  if (personalized.remaining === 0) {
    return {
      blocks: personalized.blocks,
      substituted: personalized.replaced,
      neutralized: 0,
    };
  }

  const protectedBlocks = personalized.blocks.map((block) => {
    const data = neutralize(block.data) as Record<string, unknown>;
    const dangerousFloat =
      block.type === "WHATSAPP_FLOAT" &&
      whatsappFloatIssue((block.data as { phone?: string }).phone) === "dummy";
    return { ...block, data: dangerousFloat ? { ...data, phone: "" } : data };
  });

  return {
    blocks: protectedBlocks,
    substituted: personalized.replaced,
    neutralized: personalized.remaining,
  };
}
