import { z } from "zod";
import type { CSSProperties } from "react";

const color = z.string().regex(/^#[0-9a-f]{6}$/i);

export const FONT_CHOICES = [
  "system",
  "serif",
  "mono",
  "rounded",
  "condensed",
] as const;

/**
 * Token desain satu situs.
 *
 * Field yang ditambahkan belakangan wajib punya `.default()`. Baris lama di
 * database hanya memuat enam field pertama, dan tanpa default, `safeParse`
 * gagal lalu seluruh token jatuh ke nilai bawaan — warna yang sudah diatur
 * pemilik situs akan hilang begitu saja saat deploy.
 */
export const builderDesignTokensSchema = z.object({
  accentColor: color,
  backgroundColor: color,
  textColor: color,
  headingFont: z.enum(FONT_CHOICES),
  bodyFont: z.enum(FONT_CHOICES),
  radius: z.enum(["none", "sm", "md", "lg"]),
  spacing: z.enum(["compact", "normal", "roomy"]).default("normal"),
  containerWidth: z.enum(["narrow", "normal", "wide"]).default("normal"),
  /** "auto" mengikuti preferensi sistem pengunjung. */
  colorScheme: z.enum(["light", "dark", "auto"]).default("light"),
  darkBackgroundColor: color.default("#09090b"),
  darkSurfaceColor: color.default("#18181b"),
  darkTextColor: color.default("#fafafa"),
});

export type BuilderDesignTokens = z.infer<typeof builderDesignTokensSchema>;

export const DEFAULT_DESIGN_TOKENS: BuilderDesignTokens = {
  accentColor: "#18181b",
  backgroundColor: "#ffffff",
  textColor: "#18181b",
  headingFont: "system",
  bodyFont: "system",
  radius: "md",
  spacing: "normal",
  containerWidth: "normal",
  colorScheme: "light",
  darkBackgroundColor: "#09090b",
  darkSurfaceColor: "#18181b",
  darkTextColor: "#fafafa",
};

export function parseBuilderDesignTokens(
  value: unknown,
  fallbackAccent = "#18181b"
): BuilderDesignTokens {
  const parsed = builderDesignTokensSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  return {
    ...DEFAULT_DESIGN_TOKENS,
    accentColor: /^#[0-9a-f]{6}$/i.test(fallbackAccent)
      ? fallbackAccent
      : DEFAULT_DESIGN_TOKENS.accentColor,
  };
}

/**
 * Hanya tumpukan font yang sudah ada di perangkat. Memuat font dari jaringan
 * akan menambah permintaan pemblokir render di halaman yang justru dijual
 * karena kecepatannya.
 */
export const FONT_STACKS: Record<BuilderDesignTokens["bodyFont"], string> = {
  system: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  serif: "ui-serif, Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, SFMono-Regular, 'Roboto Mono', monospace",
  rounded:
    "ui-rounded, 'SF Pro Rounded', 'Segoe UI Variable', 'Nunito', system-ui, sans-serif",
  condensed:
    "'Archivo Narrow', 'Roboto Condensed', 'Arial Narrow', ui-sans-serif, sans-serif",
};

export const FONT_LABEL: Record<BuilderDesignTokens["bodyFont"], string> = {
  system: "Sistem",
  serif: "Serif",
  mono: "Monospace",
  rounded: "Membulat",
  condensed: "Ramping",
};

const RADII: Record<BuilderDesignTokens["radius"], string> = {
  none: "0px",
  sm: "4px",
  md: "8px",
  lg: "12px",
};

export const RADIUS_LABEL: Record<BuilderDesignTokens["radius"], string> = {
  none: "Siku",
  sm: "Kecil",
  md: "Sedang",
  lg: "Besar",
};

/** Jarak vertikal antar section. */
const SECTION_SPACING: Record<BuilderDesignTokens["spacing"], string> = {
  compact: "2.5rem",
  normal: "4rem",
  roomy: "6rem",
};

export const SPACING_LABEL: Record<BuilderDesignTokens["spacing"], string> = {
  compact: "Rapat",
  normal: "Normal",
  roomy: "Lega",
};

const CONTAINER_WIDTHS: Record<BuilderDesignTokens["containerWidth"], string> = {
  narrow: "56rem",
  normal: "72rem",
  wide: "88rem",
};

export const CONTAINER_LABEL: Record<
  BuilderDesignTokens["containerWidth"],
  string
> = {
  narrow: "Sempit",
  normal: "Normal",
  wide: "Lebar",
};

export const COLOR_SCHEME_LABEL: Record<
  BuilderDesignTokens["colorScheme"],
  string
> = {
  light: "Terang",
  dark: "Gelap",
  auto: "Ikuti perangkat pengunjung",
};

export function builderDesignTokenStyle(
  tokens: BuilderDesignTokens
): CSSProperties {
  return {
    ["--bd-accent" as string]: tokens.accentColor,
    ["--bd-page-bg" as string]: tokens.backgroundColor,
    ["--bd-page-text" as string]: tokens.textColor,
    ["--bd-heading-font" as string]: FONT_STACKS[tokens.headingFont],
    ["--bd-body-font" as string]: FONT_STACKS[tokens.bodyFont],
    ["--bd-radius" as string]: RADII[tokens.radius],
    ["--bd-section-space" as string]: SECTION_SPACING[tokens.spacing],
    ["--bd-container" as string]: CONTAINER_WIDTHS[tokens.containerWidth],
    backgroundColor: tokens.backgroundColor,
    color: tokens.textColor,
    fontFamily: FONT_STACKS[tokens.bodyFont],
  } as CSSProperties;
}
