import type { Block } from "@/lib/blocks/schema";
import { isBlockHidden } from "@/lib/blocks/style";

export type BuilderAuditIssue = {
  id: string;
  level: "error" | "warning" | "info";
  label: string;
  detail: string;
};

type PageAuditSettings = {
  title: string;
  seoTitle: string;
  metaDescription: string;
  ogImage: string;
};

/**
 * Kunci gambar di skema blok, dipasangkan dengan kunci yang dipakai renderer
 * sebagai teks alternatifnya — termasuk fallback-nya, supaya audit tidak
 * memperingatkan gambar yang sebenarnya sudah punya alt saat tampil.
 *
 * Audit dulu hanya memeriksa `imageUrl`/`imageAlt`, padahal skema memakai
 * sepuluh kunci gambar. Hero, blok Image, dan Gallery tidak pernah diperiksa,
 * dan halaman tanpa satu pun alt text tetap dinyatakan lulus.
 *
 * Logo, thumbnail tautan, dan poster video sengaja tidak masuk: renderer
 * memperlakukannya sebagai dekoratif.
 */
const IMAGE_ALT_KEYS: Record<string, string[]> = {
  imageUrl: ["imageAlt", "heading", "title"],
  url: ["alt", "name"],
  mediaUrl: ["mediaAlt", "heading"],
  avatarUrl: ["avatarAlt", "name"],
  coverUrl: ["coverAlt"],
};

/**
 * Alt text bawaan skema. Tidak kosong, tapi tidak menjelaskan apa pun ke
 * pembaca layar maupun mesin pencari — sama saja dengan tidak ada.
 */
const GENERIC_ALT = new Set([
  "gallery image",
  "slide image",
  "descriptive alt text",
  "column image",
  "image",
  "gambar",
  "foto",
]);

/**
 * Nomor contoh yang pernah dikirim template bawaan. Formatnya sah untuk
 * nomor Indonesia dan bisa saja milik orang sungguhan, jadi halaman yang
 * terbit dengannya mengirim chat pembeli ke orang asing.
 */
const KNOWN_DUMMY_NUMBERS = new Set(["6281234567890", "081234567890"]);

/** Video contoh yang pernah menjadi default blok Video. */
const DEMO_VIDEO_IDS = ["dQw4w9WgXcQ"];

type PlaceholderKind = "empty" | "whatsapp" | "whatsapp-suspect" | "domain";

/** Nomor dari tautan WhatsApp atau telepon, atau undefined bila bukan keduanya. */
function contactNumber(href: string): string | undefined {
  const whatsapp =
    /^https?:\/\/(?:wa\.me\/?|api\.whatsapp\.com\/send\/?\?phone=)([^?/#&]*)/i.exec(href);
  const tel = /^tel:([^?#]*)$/i.exec(href);
  const raw = whatsapp?.[1] ?? tel?.[1];
  return raw === undefined ? undefined : raw.replace(/[\s+().-]/g, "");
}

/**
 * Nomor yang pasti bukan nomor sungguhan: nomor contoh bawaan template, atau
 * isian yang bahkan bukan angka ("62XXXXXXXXXX"). Cukup yakin untuk menolak
 * penerbitan di server.
 */
export function isCertainWhatsappPlaceholder(href: string): boolean {
  const number = contactNumber(href.trim());
  if (number === undefined) return false;
  if (!/^\d+$/.test(number) || number.length < 10) return true;
  return KNOWN_DUMMY_NUMBERS.has(number);
}

/**
 * Masalah pada nomor blok Tombol WhatsApp.
 *
 * - "dummy": nomor contoh yang sah secara format — tombol tampil dan chat
 *   pembeli terkirim ke orang lain. Penerbitan ditolak.
 * - "missing": kosong atau bukan nomor — tombol tidak tampil sama sekali.
 *   Tidak berbahaya, hanya diperingatkan.
 */
export function whatsappFloatIssue(phone: string | null | undefined): "dummy" | "missing" | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 9) return "missing";
  const normalized = digits.startsWith("0")
    ? `62${digits.slice(1)}`
    : digits.startsWith("8")
      ? `62${digits}`
      : digits;
  return KNOWN_DUMMY_NUMBERS.has(normalized) || KNOWN_DUMMY_NUMBERS.has(digits)
    ? "dummy"
    : null;
}

/** Jenis placeholder pada satu tautan, atau null bila tautannya wajar. */
export function placeholderKind(href: string): PlaceholderKind | null {
  const value = href.trim();
  if (!value || value === "#") return "empty";

  if (isCertainWhatsappPlaceholder(value)) return "whatsapp";
  const number = contactNumber(value);
  if (number !== undefined) {
    // 1111111111 atau 0812345678 — pola yang hampir pasti contoh, tapi bisa
    // saja nomor sungguhan, jadi hanya diperingatkan.
    if (/(\d)\1{6,}/.test(number) || /123456789|987654321/.test(number)) {
      return "whatsapp-suspect";
    }
    return null;
  }

  if (/\b(example\.(com|org|net)|domainanda|yourdomain|yoursite|namadomain)\b/i.test(value)) {
    return "domain";
  }
  return null;
}

function linkStringsIn(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(linkStringsIn);
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([entryKey, entryValue]) =>
      entryKey.toLowerCase().endsWith("href") && typeof entryValue === "string"
        ? [entryValue]
        : linkStringsIn(entryValue)
  );
}

type AltCount = { missing: number; generic: number };

/**
 * Menghitung gambar tanpa alt yang bermakna, per objek. Memasangkan kunci di
 * objek yang sama — bukan menghitung total gambar lalu total alt se-blok,
 * yang membuat satu alt bisa "menutupi" gambar lain.
 */
function countAlt(
  value: unknown,
  acc: AltCount,
  skipKeys: ReadonlySet<string>
): AltCount {
  if (!value || typeof value !== "object") return acc;
  if (Array.isArray(value)) {
    for (const item of value) countAlt(item, acc, skipKeys);
    return acc;
  }

  const record = value as Record<string, unknown>;
  for (const [imageKey, altKeys] of Object.entries(IMAGE_ALT_KEYS)) {
    if (skipKeys.has(imageKey)) continue;
    const src = record[imageKey];
    if (typeof src !== "string" || !src.trim()) continue;

    const alt = altKeys
      .map((key) => record[key])
      .find((candidate) => typeof candidate === "string" && candidate.trim());
    if (typeof alt !== "string") acc.missing++;
    else if (GENERIC_ALT.has(alt.trim().toLowerCase())) acc.generic++;
  }

  for (const nested of Object.values(record)) {
    if (nested && typeof nested === "object") countAlt(nested, acc, skipKeys);
  }
  return acc;
}

/**
 * Kunci yang di blok tertentu bukan gambar. `url` di blok Video adalah alamat
 * embed — memperlakukannya sebagai gambar membuat setiap blok Video dituduh
 * tidak punya alt text.
 */
const NON_IMAGE_KEYS: Partial<Record<Block["type"], ReadonlySet<string>>> = {
  VIDEO: new Set(["url"]),
};
const NO_SKIP: ReadonlySet<string> = new Set();

export function auditBuilderPage(
  settings: PageAuditSettings,
  blocks: Block[]
): BuilderAuditIssue[] {
  const issues: BuilderAuditIssue[] = [];
  const seoTitle = settings.seoTitle.trim() || settings.title.trim();
  const description = settings.metaDescription.trim();

  if (seoTitle.length < 15 || seoTitle.length > 60) {
    issues.push({
      id: "seo-title",
      level: "warning",
      label: "Judul SEO perlu diperbaiki",
      detail: `Gunakan 15–60 karakter; sekarang ${seoTitle.length}.`,
    });
  }
  if (description.length < 70 || description.length > 160) {
    issues.push({
      id: "meta-description",
      level: "warning",
      label: "Meta description perlu diperbaiki",
      detail: `Gunakan 70–160 karakter; sekarang ${description.length}.`,
    });
  }
  if (!settings.ogImage.trim()) {
    issues.push({
      id: "og-image",
      level: "info",
      label: "Gambar untuk media sosial belum ada",
      detail: "Tambahkan gambar OG supaya tautan tampil menarik saat dibagikan.",
    });
  }
  if (!blocks.some((block) => block.type === "HERO")) {
    issues.push({
      id: "hero",
      level: "info",
      label: "Tidak ada blok hero",
      detail: "Pastikan section pertama langsung menjelaskan tujuan halaman.",
    });
  }

  const alt: AltCount = { missing: 0, generic: 0 };
  const placeholders: Record<PlaceholderKind, number> = {
    empty: 0,
    whatsapp: 0,
    "whatsapp-suspect": 0,
    domain: 0,
  };
  let customHtmlBytes = 0;

  let floatsWithoutNumber = 0;
  for (const block of blocks) {
    const data = block.data as unknown;
    if (block.type === "WHATSAPP_FLOAT") {
      const issue = whatsappFloatIssue((block.data as { phone?: string }).phone);
      if (issue === "dummy") placeholders.whatsapp++;
      else if (issue === "missing") floatsWithoutNumber++;
    }
    countAlt(data, alt, NON_IMAGE_KEYS[block.type] ?? NO_SKIP);
    for (const href of linkStringsIn(data)) {
      const kind = placeholderKind(href);
      if (kind) placeholders[kind]++;
    }
    if (block.type === "CUSTOM_HTML") {
      customHtmlBytes += new TextEncoder().encode(block.data.html).length;
    }
  }

  // Dinaikkan ke error: nomor contoh mengirim chat pembeli ke orang lain.
  if (placeholders.whatsapp > 0) {
    issues.push({
      id: "placeholder-whatsapp",
      level: "error",
      label: `${placeholders.whatsapp} tombol WhatsApp masih memakai nomor contoh`,
      detail:
        "Ganti dengan nomor bisnismu. Nomor contoh bisa milik orang lain, dan chat pembelimu akan terkirim ke sana.",
    });
  }
  if (floatsWithoutNumber > 0) {
    issues.push({
      id: "whatsapp-float-missing",
      level: "warning",
      label: "Tombol WhatsApp belum punya nomor",
      detail: "Tanpa nomor yang sah, tombolnya tidak tampil di halaman publik.",
    });
  }
  const demoVideos = blocks.filter(
    (block) =>
      block.type === "VIDEO" &&
      DEMO_VIDEO_IDS.some((id) =>
        String((block.data as { url?: string }).url ?? "").includes(id)
      )
  ).length;
  if (demoVideos > 0) {
    issues.push({
      id: "demo-video",
      level: "warning",
      label: `${demoVideos} blok Video masih memutar video contoh`,
      detail: "Ganti tautannya dengan video milikmu sebelum terbit.",
    });
  }
  if (placeholders["whatsapp-suspect"] > 0) {
    issues.push({
      id: "placeholder-whatsapp-suspect",
      level: "warning",
      label: `${placeholders["whatsapp-suspect"]} nomor WhatsApp terlihat seperti contoh`,
      detail: "Pastikan nomornya benar-benar milik bisnismu sebelum terbit.",
    });
  }
  if (placeholders.empty > 0) {
    issues.push({
      id: "placeholder-links",
      level: "warning",
      label: `${placeholders.empty} tautan masih kosong`,
      detail: "Isi tautan yang kosong atau hanya berisi # sebelum terbit.",
    });
  }
  if (placeholders.domain > 0) {
    issues.push({
      id: "placeholder-domain",
      level: "warning",
      label: `${placeholders.domain} tautan menunjuk domain contoh`,
      detail: "Ganti alamat seperti example.com dengan tautan sungguhan.",
    });
  }
  if (alt.missing > 0) {
    issues.push({
      id: "image-alt",
      level: "warning",
      label: `${alt.missing} gambar tanpa alt text`,
      detail: "Tambahkan deskripsi singkat untuk pembaca layar dan pencarian gambar.",
    });
  }
  if (alt.generic > 0) {
    issues.push({
      id: "image-alt-generic",
      level: "info",
      label: `${alt.generic} gambar masih memakai alt text bawaan`,
      detail: "Alt seperti \"Gallery image\" tidak menjelaskan apa pun; ganti dengan isi gambarnya.",
    });
  }
  if (blocks.length > 30) {
    issues.push({
      id: "block-count",
      level: "warning",
      label: "Halaman besar",
      detail: `${blocks.length} blok bisa memperlambat pemuatan dan penyuntingan.`,
    });
  }
  if (customHtmlBytes > 200_000) {
    issues.push({
      id: "custom-html-size",
      level: "warning",
      label: "Custom HTML berukuran besar",
      detail: `${Math.ceil(customHtmlBytes / 1024)} KB HTML sematan bisa memperlambat halaman.`,
    });
  }
  if (blocks.length === 0) {
    issues.push({
      id: "empty-page",
      level: "error",
      label: "Halaman masih kosong",
      detail: "Tambahkan setidaknya satu blok sebelum terbit.",
    });
  } else if (blocks.every((block) => isBlockHidden(block.data))) {
    // Blok tersembunyi tidak dirender publik: halamannya akan tampil kosong.
    issues.push({
      id: "empty-page",
      level: "error",
      label: "Semua blok disembunyikan",
      detail: "Tampilkan setidaknya satu blok sebelum terbit.",
    });
  }
  return issues;
}

/**
 * Banyaknya tautan WhatsApp berisi nomor contoh di sekumpulan blok. Dipakai
 * server untuk menolak penerbitan — audit di builder hanya bisa memperingatkan,
 * dan peringatan mudah dilewati.
 */
export function countCertainWhatsappPlaceholders(
  blocks: { type?: string; data: unknown }[]
): number {
  return blocks.reduce((total, block) => {
    const links = linkStringsIn(block.data).filter(isCertainWhatsappPlaceholder).length;
    const float =
      block.type === "WHATSAPP_FLOAT" &&
      whatsappFloatIssue((block.data as { phone?: string }).phone) === "dummy"
        ? 1
        : 0;
    return total + links + float;
  }, 0);
}
