import type React from "react";

import { blockStyleSchema, type BlockStyle } from "./schema";

/**
 * Everything the Style tab stores ends up here: one pure function turns a
 * block's `style` object into the inline CSS variables, classes and id that
 * `BlockRenderer` puts on the block wrapper. The builder UI reads values back
 * through the `resolve*` helpers below, so what the panel shows and what the
 * page renders come from the same rules.
 *
 * Values are written into a `style` attribute on the server, where React does
 * not escape CSS. Anything free-form (colors, URLs, ids, classes) therefore
 * goes through a sanitizer first: an unsafe value is dropped, never passed on.
 */

export type StyleDevice = "desktop" | "tablet" | "mobile";
type StyleLevel = Partial<BlockStyle>;

/* ----- Presets the older enum fields map to ----- */

export const PADDING_Y_PRESETS: Record<string, number | undefined> = {
  default: undefined,
  none: 0,
  sm: 24,
  lg: 72,
  xl: 112,
};
export const PADDING_X_PRESETS: Record<string, number | undefined> = {
  default: undefined,
  none: 0,
  sm: 16,
  lg: 48,
};
export const MARGIN_Y_PRESETS: Record<string, number | undefined> = {
  none: undefined,
  sm: 16,
  md: 32,
  lg: 56,
};
export const RADIUS_PRESETS: Record<string, number | undefined> = {
  none: undefined,
  sm: 8,
  md: 12,
  lg: 20,
  xl: 32,
};
export const HEADING_SIZE_PRESETS: Record<string, number | undefined> = {
  default: undefined,
  sm: 24,
  md: 32,
  lg: 44,
  xl: 56,
  "2xl": 72,
};
export const BODY_SIZE_PRESETS: Record<string, number | undefined> = {
  default: undefined,
  sm: 14,
  md: 16,
  lg: 20,
};
const LEGACY_BORDER_WIDTH: Record<string, number> = { none: 0, sm: 1, md: 2 };

const FONT_STACKS: Record<string, string | undefined> = {
  default: undefined,
  sans: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
  serif: "Georgia, Cambria, Times New Roman, serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  display: "var(--bd-heading-font, var(--font-sans)), ui-sans-serif, system-ui, sans-serif",
};

const SHADOWS: Record<string, string | undefined> = {
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  "2xl": "0 25px 50px -12px rgb(0 0 0 / 0.25)",
  inner: "inset 0 2px 6px 0 rgb(0 0 0 / 0.08)",
  glow:
    "0 0 0 1px color-mix(in srgb, var(--bd-accent, #18181b) 18%, transparent), 0 18px 48px -12px color-mix(in srgb, var(--bd-accent, #18181b) 55%, transparent)",
};

/* ----- Sanitizers ----- */

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function px(value: number | undefined) {
  return isNumber(value) ? `${value}px` : undefined;
}

/**
 * Accepts the color syntaxes people actually paste — hex, rgb()/hsl() and
 * friends, named colors, `var(--x)` — and nothing that could close the
 * declaration or load a resource.
 */
export function sanitizeCssColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const color = value.trim();
  if (!color || color.length > 120) return undefined;
  if (!/^[#\w\s.,%()/+-]+$/.test(color)) return undefined;
  if (/url\s*\(|expression|image-set|attr\s*\(|\\/i.test(color)) return undefined;
  let depth = 0;
  for (const char of color) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth < 0) return undefined;
  }
  return depth === 0 ? color : undefined;
}

/** Wraps a same-site path or http(s) URL in a quoted, escaped `url()`. */
export function safeCssUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const url = value.trim();
  if (!url || url.length > 2048) return undefined;
  if (!/^(https?:\/\/|\/(?!\/))/i.test(url)) return undefined;
  const escaped = url.replace(
    /[\s"'()\\<>]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`
  );
  return `url("${escaped}")`;
}

/** A valid HTML id that is also safe in a `#fragment` link, or nothing. */
export function sanitizeAnchorId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.trim();
  return /^[A-Za-z][\w-]{0,63}$/.test(id) ? id : undefined;
}

/** Turns whatever was typed into something `sanitizeAnchorId` accepts. */
export function slugifyAnchorId(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[^a-z]+/, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64);
}

/** Space-separated CSS class names; anything else is dropped. */
export function sanitizeClassNames(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/\s+/)
    .filter((token) => /^-?[A-Za-z_][\w-]{0,63}$/.test(token))
    .slice(0, 10);
}

/** `color` at `percent` opacity, as a CSS color. */
export function colorWithOpacity(color: string, percent: number) {
  const alpha = Math.min(100, Math.max(0, percent)) / 100;
  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const full =
      hex.length === 3
        ? hex
            .split("")
            .map((char) => char + char)
            .join("")
        : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgb(${r} ${g} ${b} / ${Number(alpha.toFixed(2))})`;
  }
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}

/* ----- Per-device values ----- */

export type BoxSpacing = {
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  marginTop?: number;
  marginBottom?: number;
};

/**
 * The spacing one device level sets on its own. `undefined` means "not set
 * here", which the CSS resolves by falling back to the larger breakpoint.
 * Per-side values win over the axis value, which wins over the old preset.
 */
export function levelSpacing(level: StyleLevel): BoxSpacing {
  const paddingY = isNumber(level.paddingYValue)
    ? Math.max(0, level.paddingYValue)
    : PADDING_Y_PRESETS[level.paddingY ?? "default"];
  const paddingX = isNumber(level.paddingXValue)
    ? Math.max(0, level.paddingXValue)
    : PADDING_X_PRESETS[level.paddingX ?? "default"];
  const marginY = isNumber(level.marginYValue)
    ? Math.max(0, level.marginYValue)
    : MARGIN_Y_PRESETS[level.marginY ?? "none"];
  const side = (value: number | undefined, fallback: number | undefined, signed = false) =>
    isNumber(value) ? (signed ? value : Math.max(0, value)) : fallback;

  return {
    paddingTop: side(level.paddingTopValue, paddingY),
    paddingBottom: side(level.paddingBottomValue, paddingY),
    paddingLeft: side(level.paddingLeftValue, paddingX),
    paddingRight: side(level.paddingRightValue, paddingX),
    marginTop: side(level.marginTopValue, marginY, true),
    marginBottom: side(level.marginBottomValue, marginY, true),
  };
}

/** Levels that apply on a device, most specific first. */
function levelsFor(style: StyleLevel & { tablet?: StyleLevel; mobile?: StyleLevel }, device: StyleDevice) {
  const levels: StyleLevel[] = [];
  if (device === "mobile") levels.push(style.mobile ?? {});
  if (device !== "desktop") levels.push(style.tablet ?? {});
  levels.push(style);
  return levels;
}

/** The spacing a device actually gets, in px, after breakpoint fallback. */
export function resolveSpacing(style: Partial<BlockStyle>, device: StyleDevice): Required<BoxSpacing> {
  const levels = levelsFor(style, device).map(levelSpacing);
  const pick = (key: keyof BoxSpacing) => {
    for (const level of levels) {
      if (isNumber(level[key])) return level[key] as number;
    }
    return 0;
  };
  return {
    paddingTop: pick("paddingTop"),
    paddingRight: pick("paddingRight"),
    paddingBottom: pick("paddingBottom"),
    paddingLeft: pick("paddingLeft"),
    marginTop: pick("marginTop"),
    marginBottom: pick("marginBottom"),
  };
}

/** The first level on this device that sets `key`, if any. */
export function resolveStyleValue<K extends keyof BlockStyle>(
  style: Partial<BlockStyle>,
  device: StyleDevice,
  key: K
): BlockStyle[K] | undefined {
  for (const level of levelsFor(style, device)) {
    const value = (level as Partial<BlockStyle>)[key];
    if (value !== undefined) return value as BlockStyle[K];
  }
  return undefined;
}

/** Min height a device level sets; an explicit 0 resets a larger breakpoint. */
function levelMinHeight(level: StyleLevel, isBase: boolean) {
  if (!isNumber(level.minHeightValue)) return undefined;
  if (level.minHeightValue <= 0) return isBase ? undefined : "0px";
  return `${level.minHeightValue}${level.minHeightUnit === "vh" ? "vh" : "px"}`;
}

function levelTypography(level: StyleLevel) {
  const radius = isNumber(level.borderRadiusValue)
    ? Math.max(0, level.borderRadiusValue)
    : RADIUS_PRESETS[level.borderRadius ?? "none"];
  const headingSize =
    isNumber(level.headingSizeValue) && level.headingSizeValue > 0
      ? level.headingSizeValue
      : HEADING_SIZE_PRESETS[level.headingSize ?? "default"];
  const bodySize =
    isNumber(level.bodySizeValue) && level.bodySizeValue > 0
      ? level.bodySizeValue
      : BODY_SIZE_PRESETS[level.bodySize ?? "default"];
  const textAlign =
    level.textAlign && level.textAlign !== "default" ? level.textAlign : undefined;
  return {
    radius: px(radius),
    headingSize: px(headingSize),
    bodySize: px(bodySize),
    textAlign,
    fontFamily: FONT_STACKS[level.fontFamily ?? "default"],
    bg: sanitizeCssColor(level.backgroundColor),
    color: sanitizeCssColor(level.textColor),
  };
}

/* ----- Background, border, effects ----- */

export function backgroundLayers(style: Partial<BlockStyle>) {
  const layers: string[] = [];
  let base: string | undefined;
  if (style.backgroundType === "image") {
    base = safeCssUrl(style.backgroundImage);
  } else if (style.backgroundType === "gradient") {
    const from = sanitizeCssColor(style.gradientFrom);
    const to = sanitizeCssColor(style.gradientTo);
    if (from || to) {
      const stops = `${from ?? "transparent"}, ${to ?? "transparent"}`;
      base =
        style.gradientShape === "radial"
          ? `radial-gradient(circle at center, ${stops})`
          : `linear-gradient(${Math.round(style.gradientAngle ?? 135)}deg, ${stops})`;
    }
  }
  if (!base) return undefined;

  const overlay = style.overlayOpacity ?? 0;
  if (overlay > 0) {
    const tint = colorWithOpacity(sanitizeCssColor(style.overlayColor) ?? "#000000", overlay);
    layers.push(`linear-gradient(${tint}, ${tint})`);
  }
  layers.push(base);
  return { image: layers.join(", "), count: layers.length };
}

export function borderWidth(style: Partial<BlockStyle>) {
  if (isNumber(style.borderWidthValue)) return Math.max(0, style.borderWidthValue);
  return LEGACY_BORDER_WIDTH[style.border ?? "none"] ?? 0;
}

function borderSideWidths(sides: BlockStyle["borderSides"] | undefined, width: string) {
  switch (sides) {
    case "top":
      return `${width} 0 0 0`;
    case "bottom":
      return `0 0 ${width} 0`;
    case "y":
      return `${width} 0`;
    case "x":
      return `0 ${width}`;
    default:
      return undefined;
  }
}

/* ----- The wrapper ----- */

export type BlockWrapperProps = {
  style: React.CSSProperties;
  className: string[];
  id?: string;
};

type CssVars = Record<string, string | number | undefined>;

/**
 * Turns a block's `style` into what its wrapper element needs. Device
 * overrides are emitted as `--bd-tablet-*` / `--bd-mobile-*` variables that
 * the stylesheet swaps in at each breakpoint (and in the builder's device
 * preview), so the same markup serves every screen size.
 */
export function blockWrapperProps(input?: Partial<BlockStyle> | null): BlockWrapperProps {
  const style = input ?? {};
  const tabletData = style.tablet ?? {};
  const mobileData = style.mobile ?? {};
  const className: string[] = [];
  const vars: CssVars = {};

  const levels = [
    ["block", style, true],
    ["tablet", tabletData, false],
    ["mobile", mobileData, false],
  ] as const;

  let hasRadius = false;
  let hasMinHeight = false;
  for (const [prefix, level, isBase] of levels) {
    const spacing = levelSpacing(level);
    const type = levelTypography(level);
    const minHeight = levelMinHeight(level, isBase);
    if (type.radius) hasRadius = true;
    if (minHeight && minHeight !== "0px") hasMinHeight = true;

    vars[`--bd-${prefix}-padding-top`] = px(spacing.paddingTop);
    vars[`--bd-${prefix}-padding-bottom`] = px(spacing.paddingBottom);
    vars[`--bd-${prefix}-padding-left`] = px(spacing.paddingLeft);
    vars[`--bd-${prefix}-padding-right`] = px(spacing.paddingRight);
    vars[`--bd-${prefix}-margin-top`] = px(spacing.marginTop);
    vars[`--bd-${prefix}-margin-bottom`] = px(spacing.marginBottom);
    vars[`--bd-${prefix}-bg`] = type.bg;
    vars[`--bd-${prefix}-color`] = type.color;
    vars[`--bd-${prefix}-text-color`] = type.color;
    vars[`--bd-${prefix}-radius`] = type.radius;
    vars[`--bd-${prefix}-heading-size`] = type.headingSize;
    vars[`--bd-${prefix}-body-size`] = type.bodySize;
    vars[`--bd-${prefix}-text-align`] = type.textAlign;
    vars[`--bd-${prefix}-min-height`] = minHeight;
  }

  const desktopFont = FONT_STACKS[style.fontFamily ?? "default"];

  // Layout
  if (isNumber(style.maxWidthValue) && style.maxWidthValue > 0) {
    className.push("bd-has-max-width");
    vars["--bd-block-max-width"] = `${style.maxWidthValue}px`;
  }
  if (hasMinHeight) {
    vars["--bd-block-display"] = "flex";
    vars["--bd-block-justify"] =
      style.verticalAlign === "center"
        ? "center"
        : style.verticalAlign === "bottom"
          ? "flex-end"
          : "flex-start";
  }

  // Background
  const background = backgroundLayers(style);
  if (background) {
    const image = style.backgroundType === "image";
    const repeat = image && style.backgroundRepeat ? "repeat" : "no-repeat";
    const size = image ? (style.backgroundSize ?? "cover") : "cover";
    const position = image ? (style.backgroundPosition ?? "center") : "center";
    const attachment = image && style.backgroundFixed ? "fixed" : "scroll";
    // The overlay tint, when present, is the first layer and always covers
    // the whole box; the image or gradient under it gets the chosen values.
    const withOverlay = (overlayValue: string, value: string) =>
      background.count > 1 ? `${overlayValue}, ${value}` : value;
    vars["--bd-block-bg-image"] = background.image;
    vars["--bd-block-bg-size"] = withOverlay("cover", size);
    vars["--bd-block-bg-position"] = withOverlay("center", position);
    vars["--bd-block-bg-repeat"] = withOverlay("no-repeat", repeat);
    vars["--bd-block-bg-attachment"] = withOverlay(attachment, attachment);
    if (attachment === "fixed") className.push("bd-bg-fixed");
  }

  // Typography
  vars["--bd-block-heading-color"] = sanitizeCssColor(style.headingColor);
  vars["--bd-accent"] = sanitizeCssColor(style.accentColor);
  if (style.headingWeight && style.headingWeight !== "default") {
    className.push("bd-has-heading-weight");
    vars["--bd-block-heading-weight"] = style.headingWeight;
  }
  if (style.headingTransform && style.headingTransform !== "none") {
    className.push("bd-has-heading-transform");
    vars["--bd-block-heading-transform"] = style.headingTransform;
  }
  if (isNumber(style.lineHeightValue) && style.lineHeightValue > 0) {
    className.push("bd-has-line-height");
    vars["--bd-block-line-height"] = String(style.lineHeightValue);
  }
  if (isNumber(style.letterSpacingValue) && style.letterSpacingValue !== 0) {
    className.push("bd-has-letter-spacing");
    vars["--bd-block-letter-spacing"] = `${style.letterSpacingValue}em`;
  }

  // Border & shadow
  const width = borderWidth(style);
  if (width > 0) {
    const color = sanitizeCssColor(style.borderColor) ?? "#e4e4e7";
    vars["--bd-block-border"] = `${width}px ${style.borderStyle ?? "solid"} ${color}`;
    const sides = borderSideWidths(style.borderSides, `${width}px`);
    if (sides) {
      className.push("bd-has-border-sides");
      vars["--bd-block-border-widths"] = sides;
    }
  }
  vars["--bd-block-shadow"] = SHADOWS[style.shadow ?? "none"];

  // Effects
  const opacity = isNumber(style.opacity) ? style.opacity : 100;
  const blur = isNumber(style.backdropBlur) ? style.backdropBlur : 0;

  const css: React.CSSProperties = {
    fontFamily: desktopFont,
    overflow: hasRadius || style.clipContent ? "hidden" : undefined,
    opacity: opacity < 100 ? Math.max(0, opacity) / 100 : undefined,
    backdropFilter: blur > 0 ? `blur(${blur}px)` : undefined,
    WebkitBackdropFilter: blur > 0 ? `blur(${blur}px)` : undefined,
  };
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined && value !== "") {
      (css as Record<string, unknown>)[key] = value;
    }
  }

  className.push(...sanitizeClassNames(style.className));

  return { style: css, className, id: sanitizeAnchorId(style.anchorId) };
}

export function isBlockHidden(data: unknown) {
  const style = (data as { style?: { hidden?: unknown } } | null | undefined)?.style;
  return style?.hidden === true;
}

/* ----- Presets & clipboard ----- */

export type StylePreset = {
  id: string;
  label: string;
  hint: string;
  patch: Partial<BlockStyle>;
};

/**
 * One-click looks. Each preset only touches the fields it is about, so it can
 * be layered on top of whatever the block already has.
 */
export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "spacious",
    label: "Lega",
    hint: "Padding besar atas-bawah",
    patch: { paddingYValue: 96, paddingTopValue: undefined, paddingBottomValue: undefined },
  },
  {
    id: "card",
    label: "Kartu",
    hint: "Kotak putih, sudut bulat, bayangan",
    patch: {
      backgroundType: "color",
      backgroundColor: "#ffffff",
      borderRadiusValue: 24,
      shadow: "xl",
      marginYValue: 24,
      maxWidthValue: 1120,
      borderWidthValue: 1,
      borderColor: "#e4e4e7",
      borderSides: "all",
    },
  },
  {
    id: "soft",
    label: "Lembut",
    hint: "Latar abu terang",
    patch: { backgroundType: "color", backgroundColor: "#f4f4f5", textColor: "" },
  },
  {
    id: "dark",
    label: "Gelap",
    hint: "Latar gelap, teks terang",
    patch: {
      backgroundType: "color",
      backgroundColor: "#09090b",
      textColor: "#fafafa",
      headingColor: "#ffffff",
    },
  },
  {
    id: "gradient",
    label: "Gradien",
    hint: "Gradien warna aksen",
    patch: {
      backgroundType: "gradient",
      gradientFrom: "#eef2ff",
      gradientTo: "#fdf2f8",
      gradientAngle: 135,
      gradientShape: "linear",
    },
  },
  {
    id: "glass",
    label: "Kaca",
    hint: "Transparan dengan blur",
    patch: {
      backgroundType: "color",
      backgroundColor: "rgb(255 255 255 / 0.6)",
      backdropBlur: 16,
      borderWidthValue: 1,
      borderColor: "rgb(255 255 255 / 0.7)",
      borderRadiusValue: 20,
      shadow: "lg",
    },
  },
  {
    id: "fullscreen",
    label: "Penuh",
    hint: "Setinggi layar, isi di tengah",
    patch: { minHeightValue: 100, minHeightUnit: "vh", verticalAlign: "center" },
  },
  {
    id: "outlined",
    label: "Garis",
    hint: "Garis atas-bawah tipis",
    patch: { borderWidthValue: 1, borderSides: "y", borderColor: "#e4e4e7", borderStyle: "solid" },
  },
];

export const STYLE_CLIPBOARD_KEY = "buildery:style-clipboard";

/**
 * Validates a style copied from another block (possibly another tab or an
 * older version of the app) before it is applied. Identity fields — the
 * anchor id and the hidden flag — are never pasted: two blocks sharing an id
 * breaks `#links`, and pasting a style should not make a block disappear.
 */
export function parseStyleClipboard(raw: unknown): BlockStyle | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = blockStyleSchema.safeParse(raw);
  if (!parsed.success) return null;
  return { ...parsed.data, anchorId: "", hidden: false };
}

export const EMPTY_BLOCK_STYLE: BlockStyle = blockStyleSchema.parse({});

/** Whether a block's style differs from the defaults at all. */
export function hasCustomStyle(style: unknown) {
  if (!style || typeof style !== "object") return false;
  const parsed = blockStyleSchema.safeParse(style);
  if (!parsed.success) return false;
  return JSON.stringify(parsed.data) !== JSON.stringify(EMPTY_BLOCK_STYLE);
}
