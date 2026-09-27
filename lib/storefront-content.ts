// Registry-driven editable text for public storefront pages.
// Each pageKey lists the editable fields (drives the dashboard form). The
// actual fallback default is supplied by the page at render time via
// resolveContent(), so dynamic defaults (e.g. "Updates from <name>") stay intact.
// Client + server safe (no prisma import).

export type StorefrontField = {
  key: string;
  label: string;
  multiline?: boolean;
  placeholder?: string;
};

export type StorefrontPageDef = {
  title: string;
  description: string;
  fields: StorefrontField[];
};

export const STOREFRONT_PAGES = {
  products_catalog: {
    title: "Halaman katalog produk",
    description: "Teks di atas daftar produk publik.",
    fields: [
      { key: "heading", label: "Judul", placeholder: "Products" },
      { key: "subheading", label: "Deskripsi (opsional)", multiline: true, placeholder: "Tampil di bawah judul" },
    ],
  },
  products_single: {
    title: "Halaman detail produk",
    description: "Label & teks template di halaman detail produk. Konten produk sendiri diedit per-produk.",
    fields: [
      { key: "descriptionHeading", label: "Judul section deskripsi", placeholder: "Deskripsi" },
      { key: "detailsHeading", label: "Judul section detail", placeholder: "Product details" },
      { key: "checkoutNote", label: "Catatan di bawah tombol beli", multiline: true, placeholder: "Checkout cepat dengan notifikasi email dan WhatsApp." },
    ],
  },
  blog_catalog: {
    title: "Halaman blog",
    description: "Teks hero di atas daftar artikel.",
    fields: [
      { key: "eyebrow", label: "Eyebrow", placeholder: "Blog" },
      { key: "heading", label: "Judul", placeholder: "Updates from <nama workspace>" },
      { key: "subheading", label: "Deskripsi", multiline: true, placeholder: "Notes, guides, announcements…" },
    ],
  },
  blog_single: {
    title: "Halaman detail artikel",
    description: "Label & teks template di halaman artikel.",
    fields: [
      { key: "backLabel", label: "Teks tombol kembali", placeholder: "Back to blog" },
      { key: "relatedHeading", label: "Judul section artikel terkait", placeholder: "Related posts" },
    ],
  },
  memberships_catalog: {
    title: "Halaman membership",
    description: "Teks hero di atas daftar paket membership.",
    fields: [
      { key: "heading", label: "Judul", placeholder: "Memberships" },
      { key: "subheading", label: "Deskripsi", multiline: true, placeholder: "Join <nama> to unlock…" },
    ],
  },
  courses_single: {
    title: "Halaman detail kursus",
    description: "Label & teks template di halaman detail kursus. Konten kursus sendiri diedit per-kursus.",
    fields: [
      { key: "curriculumHeading", label: "Judul section kurikulum", placeholder: "Curriculum" },
      { key: "enrollFreeLabel", label: "Teks tombol (kursus gratis)", placeholder: "Enroll for free" },
      { key: "enrollPaidLabel", label: "Teks tombol (kursus berbayar)", placeholder: "Get access" },
    ],
  },
} satisfies Record<string, StorefrontPageDef>;

export type StorefrontPageKey = keyof typeof STOREFRONT_PAGES;

/**
 * Merge stored overrides with caller-supplied defaults for every field of a
 * page. Stored value wins when non-empty; otherwise the default (which may be
 * dynamic, e.g. include the workspace name).
 */
export function resolveContent(
  pageKey: StorefrontPageKey,
  content: Record<string, unknown> | null | undefined,
  defaults: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of STOREFRONT_PAGES[pageKey].fields) {
    const v = content?.[f.key];
    out[f.key] =
      typeof v === "string" && v.trim() ? v.trim() : defaults[f.key] ?? "";
  }
  return out;
}
