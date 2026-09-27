import type { BuilderDesignTokens } from "@/lib/builder-design-tokens";

/**
 * Mode gelap untuk halaman publik.
 *
 * Blok menuliskan warnanya sebagai utility Tailwind tetap — `bg-white`,
 * `text-zinc-900`, dan seterusnya — sebanyak ~770 kemunculan di 33 berkas.
 * Menulis ulang semuanya satu per satu adalah perubahan besar yang mudah
 * merusak tampilan yang sudah jadi, dan hasilnya tetap harus dijaga manual
 * setiap kali ada blok baru.
 *
 * Jadi pemetaannya dilakukan sekali di sini: satu blok CSS bercakupan halaman
 * publik yang mendeklarasikan ulang segelintir utility itu saat skema gelap
 * aktif. Selektornya `[data-bd-scheme="dark"] .bg-white` (spesifisitas 0,2,0)
 * selalu menang atas `.bg-white` (0,1,0), jadi tidak perlu `!important` dan
 * tidak ada blok yang perlu disentuh.
 *
 * Yang sengaja TIDAK dipetakan: warna yang dipilih sendiri pemilik situs lewat
 * pengaturan style per blok. Itu keputusan mereka, bukan warna bawaan tema.
 */

/** Utility permukaan terang → permukaan gelap. */
const SURFACE_MAP: Record<string, string> = {
  "bg-white": "var(--bd-dark-surface)",
  "bg-zinc-50": "var(--bd-dark-bg)",
  "bg-zinc-100": "var(--bd-dark-surface)",
  "bg-zinc-200": "#27272a",
};

/** Utility permukaan gelap → tetap gelap, tapi selaras dengan tokennya. */
const INVERTED_SURFACE_MAP: Record<string, string> = {
  "bg-zinc-950": "var(--bd-dark-surface)",
  "bg-zinc-900": "var(--bd-dark-surface)",
  "bg-zinc-800": "#27272a",
};

/** Utility teks. Nilai terang dinaikkan, nilai gelap diturunkan. */
const TEXT_MAP: Record<string, string> = {
  "text-zinc-950": "var(--bd-dark-text)",
  "text-zinc-900": "var(--bd-dark-text)",
  "text-zinc-800": "#e4e4e7",
  "text-zinc-700": "#d4d4d8",
  "text-zinc-600": "#a1a1aa",
  "text-zinc-500": "#a1a1aa",
  "text-zinc-400": "#71717a",
  "text-zinc-300": "#52525b",
  "text-zinc-200": "#3f3f46",
};

const BORDER_MAP: Record<string, string> = {
  "border-zinc-100": "#27272a",
  "border-zinc-200": "#27272a",
  "border-zinc-300": "#3f3f46",
  "border-zinc-400": "#52525b",
  "border-zinc-900": "#3f3f46",
  "border-zinc-950": "#3f3f46",
};

const SCOPE = '[data-bd-scheme="dark"]';

function rules(): string {
  const out: string[] = [];

  out.push(
    `${SCOPE}{background-color:var(--bd-dark-bg);color:var(--bd-dark-text);color-scheme:dark}`
  );

  for (const [utility, value] of Object.entries({
    ...SURFACE_MAP,
    ...INVERTED_SURFACE_MAP,
  })) {
    out.push(`${SCOPE} .${utility}{background-color:${value}}`);
  }
  for (const [utility, value] of Object.entries(TEXT_MAP)) {
    out.push(`${SCOPE} .${utility}{color:${value}}`);
  }
  for (const [utility, value] of Object.entries(BORDER_MAP)) {
    out.push(`${SCOPE} .${utility}{border-color:${value}}`);
  }

  // text-white dan bg-zinc-950 sering dipakai untuk tombol aksen di atas
  // permukaan berwarna; membiarkannya apa adanya menjaga kontrasnya.
  return out.join("");
}

/**
 * CSS mode gelap untuk satu halaman.
 *
 * Skema "auto" membungkusnya dalam media query supaya pengunjung yang memakai
 * perangkat bermode terang tetap melihat versi terang.
 */
export function darkModeCss(tokens: BuilderDesignTokens): string | null {
  if (tokens.colorScheme === "light") return null;

  const body = rules();
  return tokens.colorScheme === "auto"
    ? `@media (prefers-color-scheme: dark){${body}}`
    : body;
}

/**
 * Nilai atribut `data-bd-scheme` untuk wadah halaman.
 *
 * Skema "auto" tetap memasang "dark": media query di CSS yang memutuskan
 * apakah aturannya berlaku, jadi penanda yang sama bisa dipakai keduanya.
 */
export function darkModeAttribute(
  tokens: BuilderDesignTokens
): "dark" | undefined {
  return tokens.colorScheme === "light" ? undefined : "dark";
}

/** Variabel warna mode gelap, ikut dipasang di wadah halaman. */
export function darkModeVariables(
  tokens: BuilderDesignTokens
): Record<string, string> {
  return {
    "--bd-dark-bg": tokens.darkBackgroundColor,
    "--bd-dark-surface": tokens.darkSurfaceColor,
    "--bd-dark-text": tokens.darkTextColor,
  };
}
