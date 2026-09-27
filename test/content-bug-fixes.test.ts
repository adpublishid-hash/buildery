import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const BLOCKS = path.join(process.cwd(), "components", "blocks");

function read(...parts: string[]) {
  return readFileSync(path.join(...parts), "utf8");
}

describe("BlockImage callers declare their real display width", () => {
  const files = readdirSync(BLOCKS).filter(
    (f) => f.endsWith(".tsx") && f !== "block-image.tsx"
  );

  it("passes sizes at every call site", () => {
    // Default "100vw" dulu berarti avatar 40px ikut mengunduh varian 1080w —
    // lebih berat daripada gambar aslinya.
    for (const file of files) {
      const source = read(BLOCKS, file);
      const calls = source.split("<BlockImage").slice(1);
      for (const [index, call] of calls.entries()) {
        const props = call.slice(0, call.indexOf("/>"));
        expect(
          props.includes("sizes="),
          `${file} pemanggil ke-${index + 1} tanpa sizes`
        ).toBe(true);
      }
    }
  });

  it("keeps sizes required so a new block cannot skip it", () => {
    const source = read(BLOCKS, "block-image.tsx");
    expect(source).toMatch(/\n\s*sizes: string;/);
    expect(source).not.toMatch(/sizes\?: string/);
    expect(source).not.toMatch(/sizes = "100vw"/);
  });

  it("offers only widths the Next image optimizer accepts", () => {
    // Lebar di luar imageSizes/deviceSizes bawaan dijawab HTTP 400, jadi
    // gambarnya gagal dimuat sama sekali.
    const source = read(BLOCKS, "block-image.tsx");
    const widths = source
      .match(/const WIDTHS = \[([^\]]*)\]/)![1]
      .split(",")
      .map((v) => Number(v.trim()))
      .filter(Boolean);

    const imageSizes = [16, 32, 48, 64, 96, 128, 256, 384];
    const deviceSizes = [640, 750, 828, 1080, 1200, 1920, 2048, 3840];
    const allowed = new Set([...imageSizes, ...deviceSizes]);

    expect(widths.length).toBeGreaterThan(5);
    for (const width of widths) {
      expect(allowed.has(width), `lebar ${width} akan ditolak`).toBe(true);
    }
  });

  it("offers small candidates so avatars are not forced to 384px", () => {
    const source = read(BLOCKS, "block-image.tsx");
    const widths = source
      .match(/const WIDTHS = \[([^\]]*)\]/)![1]
      .split(",")
      .map((v) => Number(v.trim()))
      .filter(Boolean);
    expect(Math.min(...widths)).toBeLessThanOrEqual(96);
  });
});

describe("homepage detection comes from the resolver", () => {
  const source = read(process.cwd(), "lib", "public-page.ts");
  const view = read(process.cwd(), "components", "site", "public-page-view.tsx");

  it("marks the root request as the homepage", () => {
    expect(source).toContain("isHomePage: !pageSlug");
  });

  it("does not infer the homepage from homePageId", () => {
    // homePageId boleh kosong, dan di basis data ini memang kosong di semua
    // situs — menyimpulkan darinya membuat halaman depan menandai dirinya
    // sebagai halaman biasa, lengkap dengan breadcrumb ke dirinya sendiri.
    expect(view).not.toContain("homePageId === page.id");
    expect(view).toContain("resolved.isHomePage");
  });

  it("versions the public page cache key", () => {
    // Tanpa versi, entri yang ditulis sebelum bentuk payload berubah tetap
    // dibaca setelah deploy, dengan field baru berisi undefined.
    expect(source).toMatch(/"public-page", "v\d+"/);
  });
});

describe("source text is free of mojibake", () => {
  // Tabel cp1252 ditulis eksplisit. Jangan ganti dengan
  // `new TextDecoder("windows-1252")`: di Node 22 label itu didekode sebagai
  // latin1, jadi 0x80 menjadi U+0080 alih-alih "€" — tes jadi konsisten dengan
  // dirinya sendiri tapi buta terhadap mojibake sungguhan di berkas.
  //
  // 0x80-0x9F adalah satu-satunya rentang yang berbeda dari latin1. Posisi
  // yang tidak terdefinisi di cp1252 dipetakan ke karakter kontrol C1-nya.
  const C1: Record<number, number> = {
    0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
    0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
    0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
    0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
    0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
    0x9e: 0x017e, 0x9f: 0x0178,
  };
  const charOf = (byte: number) => String.fromCodePoint(C1[byte] ?? byte);
  const toByte = new Map<string, number>();
  for (let b = 0x80; b <= 0xff; b++) toByte.set(charOf(b), b);

  const escape = (c: string) => c.replace(/[\\\]^-]/g, "\\$&");
  const high = [...toByte.keys()].map(escape).join("");
  // Pembuka urutan UTF-8 multibyte: byte 0xC2-0xF4.
  const lead = Array.from({ length: 0xf5 - 0xc2 }, (_, i) => escape(charOf(0xc2 + i))).join("");
  const pattern = new RegExp(`[${lead}][${high}]{1,3}`, "g");

  /** Contoh mojibake sungguhan, dibangun dari byte UTF-8 lewat tabel di atas. */
  const mangle = (text: string) =>
    [...new TextEncoder().encode(text)].map(charOf).join("");

  function mojibake(source: string): string[] {
    const hits: string[] = [];
    for (const match of source.match(pattern) ?? []) {
      // Hanya runtun yang benar-benar bisa diputar balik yang dihitung, jadi
      // teks beraksen yang memang disengaja tidak ikut tertuduh.
      const bytes = Uint8Array.from([...match].map((c) => toByte.get(c) ?? 0));
      try {
        const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        if (decoded !== match) hits.push(match);
      } catch {
        // Bukan UTF-8 yang tersalahbaca.
      }
    }
    return hits;
  }

  it("recognises the corruptions that slipped past the first version", () => {
    // Em-dash, bintang, emoji 4-byte, dan titik tengah — semuanya pernah ada
    // di template bawaan. Tes ini memastikan detektornya tidak lulus kosong.
    for (const text of ["\u2014", "\u2605", "\u{1F69A}", "\u00b7", "\u2713", "\u2122"]) {
      expect(mojibake(`Soleva ${mangle(text)} Launch`), text).toHaveLength(1);
    }
  });

  it("does not accuse intentional accented text", () => {
    expect(mojibake("Caf\u00e9 r\u00e9sum\u00e9 \u2014 Rp 99.000 \u00b7 \u2605")).toEqual([]);
  });

  it("keeps the built-in template copy readable", () => {
    // Nama template tampil apa adanya di dialog import; "Soleva â€” Shoe
    // Launch" adalah yang dilihat pengguna sebelum ini.
    const hits = mojibake(
      read(process.cwd(), "lib", "blocks", "templates.ts")
    );
    expect(hits).toEqual([]);
  });

  it("keeps the block schema readable", () => {
    const hits = mojibake(read(process.cwd(), "lib", "blocks", "schema.ts"));
    expect(hits).toEqual([]);
  });
});
