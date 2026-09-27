import { z } from "zod";

import type { MetaStandardEventName } from "@/lib/meta-capi";

/**
 * Per-page tracking event and custom CSS, edited from the builder's page
 * settings. Shared by the dialog (labels, limits) and the API (validation).
 */

/** Events a page may fire on view. Purchase/cart events belong to checkout. */
export const PAGE_PIXEL_EVENTS = [
  { value: "Lead", label: "Lead", hint: "Halaman terima kasih setelah isi form." },
  { value: "ViewContent", label: "View Content", hint: "Halaman penawaran atau detail produk." },
  { value: "CompleteRegistration", label: "Complete Registration", hint: "Setelah pendaftaran selesai." },
  { value: "Contact", label: "Contact", hint: "Halaman kontak atau konsultasi." },
  { value: "Subscribe", label: "Subscribe", hint: "Setelah berlangganan newsletter." },
  { value: "Schedule", label: "Schedule", hint: "Setelah membuat janji atau booking." },
  { value: "SubmitApplication", label: "Submit Application", hint: "Setelah mengirim lamaran atau aplikasi." },
  { value: "StartTrial", label: "Start Trial", hint: "Setelah memulai uji coba." },
] as const satisfies readonly { value: MetaStandardEventName; label: string; hint: string }[];

export type PagePixelEvent = (typeof PAGE_PIXEL_EVENTS)[number]["value"];

const PIXEL_EVENT_VALUES = PAGE_PIXEL_EVENTS.map((event) => event.value) as [
  PagePixelEvent,
  ...PagePixelEvent[],
];

export function isPagePixelEvent(value: unknown): value is PagePixelEvent {
  return typeof value === "string" && (PIXEL_EVENT_VALUES as string[]).includes(value);
}

export const PAGE_CSS_MAX = 20_000;

/**
 * The CSS is written inline into a <style> tag, so the hard rule is that it
 * cannot close that tag. HTML comments are refused for the same reason the
 * workspace script refuses them.
 */
const CLOSES_STYLE = /<\/style/i;
const HTML_COMMENT = /<!--/;

export const pageAdvancedSchema = z
  .object({
    pixelEvent: z.union([z.enum(PIXEL_EVENT_VALUES), z.literal("")]).optional(),
    customCss: z
      .string()
      .max(PAGE_CSS_MAX, `CSS maksimal ${PAGE_CSS_MAX.toLocaleString("id-ID")} karakter.`)
      .refine((value) => !CLOSES_STYLE.test(value) && !HTML_COMMENT.test(value), {
        message: "CSS tidak boleh berisi </style> atau komentar HTML.",
      })
      .optional(),
  })
  .strict();

export type PageAdvancedInput = z.infer<typeof pageAdvancedSchema>;

/** Empty or whitespace-only code is stored as null. */
export function normalizeCode(value: string | undefined) {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Strips a pasted `<style>` wrapper so the common copy-paste still works. */
export function unwrapStyleTag(value: string) {
  const match = /^\s*<style[^>]*>([\s\S]*?)<\/style>\s*$/i.exec(value);
  return match ? match[1] : value;
}
