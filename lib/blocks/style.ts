import { blockStyleSchema, type BlockStyle } from "./schema";

/**
 * Everything the Style tab stores ends up here: pure functions turn a block's
 * `style` object into scoped CSS (one rule set per device), plus the classes
 * and id that `BlockRenderer` puts on the block wrapper. The builder UI reads
 * values back through the `resolve*` helpers below, so what the panel shows
 * and what the page renders come from the same rules.
 *
 * Every style field can be overridden for tablet and mobile. A device gets
 * the desktop value unless its own level (or, for mobile, the tablet level)
 * sets one.
 *
 * The CSS is written into a <style> element on the server, where React does
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

/** Whether a stored value counts as "set" at a device level. */
function isSetValue(value: unknown) {
  return value !== undefined && value !== "";
}

/**
 * The first level on this device that sets `key`, if any. An empty string
 * counts as unset, so clearing a tablet color falls back to desktop again.
 */
export function resolveStyleValue<K extends keyof BlockStyle>(
  style: Partial<BlockStyle>,
  device: StyleDevice,
  key: K
): BlockStyle[K] | undefined {
  for (const level of levelsFor(style, device)) {
    const value = (level as Partial<BlockStyle>)[key];
    if (isSetValue(value)) return value as BlockStyle[K];
  }
  return undefined;
}

/**
 * Every style field as a device actually gets it: the desktop style with the
 * tablet override on top and, for mobile, the mobile override on top of that.
 */
export function resolveDeviceStyle(style: Partial<BlockStyle>, device: StyleDevice): Partial<BlockStyle> {
  const merged: Record<string, unknown> = {};
  for (const level of levelsFor(style, device).reverse()) {
    for (const [key, value] of Object.entries(level)) {
      if (key === "tablet" || key === "mobile") continue;
      if (isSetValue(value)) merged[key] = value;
    }
  }
  return merged as Partial<BlockStyle>;
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

/* ----- Per-device CSS ----- */

/**
 * What one device gets, grouped by where it applies:
 * - `self`: the block wrapper (mostly `--bd-block-*` variables that
 *   `.bd-block-style` in globals.css turns into real properties),
 * - `child`: the block's own root element,
 * - `headings` / `text`: elements inside the block.
 */
export type StyleDeclarations = {
  self: Record<string, string>;
  child: Record<string, string>;
  headings: Record<string, string>;
  text: Record<string, string>;
};

export function deviceDeclarations(input: Partial<BlockStyle> | null | undefined, device: StyleDevice): StyleDeclarations {
  const style = input ?? {};
  const r = resolveDeviceStyle(style, device);
  const spacing = resolveSpacing(style, device);
  const self: Record<string, string> = {};
  const child: Record<string, string> = {};
  const headings: Record<string, string> = {};
  const text: Record<string, string> = {};
  const set = (target: Record<string, string>, key: string, value: string | undefined) => {
    if (value !== undefined && value !== "") target[key] = value;
  };
  const nonZero = (value: number) => (value !== 0 ? `${value}px` : undefined);

  // Spacing
  set(self, "--bd-block-padding-top", nonZero(spacing.paddingTop));
  set(self, "--bd-block-padding-right", nonZero(spacing.paddingRight));
  set(self, "--bd-block-padding-bottom", nonZero(spacing.paddingBottom));
  set(self, "--bd-block-padding-left", nonZero(spacing.paddingLeft));
  set(self, "--bd-block-margin-top", nonZero(spacing.marginTop));
  set(self, "--bd-block-margin-bottom", nonZero(spacing.marginBottom));

  // Layout
  if (isNumber(r.maxWidthValue) && r.maxWidthValue > 0) {
    child.width = "100%";
    child["max-width"] = `${r.maxWidthValue}px`;
    child["margin-left"] = "auto";
    child["margin-right"] = "auto";
  }
  if (isNumber(r.minHeightValue) && r.minHeightValue > 0) {
    set(self, "--bd-block-min-height", `${r.minHeightValue}${r.minHeightUnit === "vh" ? "vh" : "px"}`);
    set(self, "--bd-block-display", "flex");
    set(
      self,
      "--bd-block-justify",
      r.verticalAlign === "center" ? "center" : r.verticalAlign === "bottom" ? "flex-end" : "flex-start"
    );
  }

  // Colors & type
  const radius = isNumber(r.borderRadiusValue)
    ? Math.max(0, r.borderRadiusValue)
    : RADIUS_PRESETS[r.borderRadius ?? "none"];
  const headingSize =
    isNumber(r.headingSizeValue) && r.headingSizeValue > 0
      ? r.headingSizeValue
      : HEADING_SIZE_PRESETS[r.headingSize ?? "default"];
  const bodySize =
    isNumber(r.bodySizeValue) && r.bodySizeValue > 0
      ? r.bodySizeValue
      : BODY_SIZE_PRESETS[r.bodySize ?? "default"];
  const textColor = sanitizeCssColor(r.textColor);
  set(self, "font-family", FONT_STACKS[r.fontFamily ?? "default"]);
  set(self, "--bd-block-bg", sanitizeCssColor(r.backgroundColor));
  set(self, "--bd-block-color", textColor);
  set(self, "--bd-block-text-color", textColor);
  set(self, "--bd-block-heading-color", sanitizeCssColor(r.headingColor));
  set(self, "--bd-accent", sanitizeCssColor(r.accentColor));
  set(self, "--bd-block-radius", px(radius));
  set(self, "--bd-block-heading-size", px(headingSize));
  set(self, "--bd-block-body-size", px(bodySize));
  set(self, "--bd-block-text-align", r.textAlign && r.textAlign !== "default" ? r.textAlign : undefined);
  if (r.headingWeight && r.headingWeight !== "default") headings["font-weight"] = r.headingWeight;
  if (r.headingTransform && r.headingTransform !== "none") headings["text-transform"] = r.headingTransform;
  if (isNumber(r.letterSpacingValue) && r.letterSpacingValue !== 0) {
    headings["letter-spacing"] = `${r.letterSpacingValue}em`;
  }
  if (isNumber(r.lineHeightValue) && r.lineHeightValue > 0) text["line-height"] = String(r.lineHeightValue);

  // Background
  const background = backgroundLayers(r);
  if (background) {
    const image = r.backgroundType === "image";
    const repeat = image && r.backgroundRepeat ? "repeat" : "no-repeat";
    const attachment = image && r.backgroundFixed ? "fixed" : "scroll";
    // The overlay tint, when present, is the first layer and always covers
    // the whole box; the image or gradient under it gets the chosen values.
    const withOverlay = (overlayValue: string, value: string) =>
      background.count > 1 ? `${overlayValue}, ${value}` : value;
    set(self, "--bd-block-bg-image", background.image);
    set(self, "--bd-block-bg-size", withOverlay("cover", image ? (r.backgroundSize ?? "cover") : "cover"));
    set(self, "--bd-block-bg-position", withOverlay("center", image ? (r.backgroundPosition ?? "center") : "center"));
    set(self, "--bd-block-bg-repeat", withOverlay("no-repeat", repeat));
    set(self, "--bd-block-bg-attachment", withOverlay(attachment, attachment));
  }

  // Border & shadow
  const width = borderWidth(r);
  if (width > 0) {
    const color = sanitizeCssColor(r.borderColor) ?? "#e4e4e7";
    set(self, "--bd-block-border", `${width}px ${r.borderStyle ?? "solid"} ${color}`);
    set(self, "border-width", borderSideWidths(r.borderSides, `${width}px`));
  }
  set(self, "--bd-block-shadow", SHADOWS[r.shadow ?? "none"]);

  // Effects
  if (radius !== undefined || r.clipContent) self.overflow = "hidden";
  if (isNumber(r.opacity) && r.opacity < 100) self.opacity = String(Math.max(0, r.opacity) / 100);
  if (isNumber(r.backdropBlur) && r.backdropBlur > 0) {
    self["backdrop-filter"] = `blur(${r.backdropBlur}px)`;
    self["-webkit-backdrop-filter"] = `blur(${r.backdropBlur}px)`;
  }

  return { self, child, headings, text };
}

/** The class that scopes a block's generated CSS; derived from its id. */
export function blockScopeClass(blockId: string) {
  return `bd-s-${blockId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80)}`;
}

function declarationBlock(entries: Record<string, string>, important = false) {
  return Object.entries(entries)
    .map(([key, value]) => `${key}:${value}${important ? " !important" : ""}`)
    .join(";");
}

function rulesFor(scope: string, declarations: StyleDeclarations) {
  const selector = `.bd-block-style.${scope}`;
  const rules: string[] = [];
  const add = (target: string, body: string) => {
    if (body) rules.push(`${target}{${body}}`);
  };
  add(selector, declarationBlock(declarations.self));
  add(`${selector}>*`, declarationBlock(declarations.child));
  add(`${selector} :where(h1,h2,h3,h4)`, declarationBlock(declarations.headings, true));
  add(`${selector} :where(p,li,.bd-rich-text)`, declarationBlock(declarations.text, true));
  return rules.join("");
}

/** Media ranges matching the visibility breakpoints in globals.css. */
const RANGES = {
  desktop: "(min-width:1024px)",
  tablet: "(min-width:640px) and (max-width:1023px)",
  mobile: "(max-width:639px)",
  desktopTablet: "(min-width:640px)",
  tabletMobile: "(max-width:1023px)",
} as const;

/**
 * The CSS for one block. Each device gets its fully resolved declarations in
 * its own, non-overlapping media range, so a tablet value never has to
 * "undo" a desktop one — which is what lets every field differ per device.
 * Devices that end up identical share a rule.
 *
 * In the builder (`previewDevice` set) the canvas is narrower than the
 * browser, so media queries would answer for the wrong width; there the
 * previewed device's rules apply unconditionally.
 */
export function blockStyleCss(
  input: Partial<BlockStyle> | null | undefined,
  scope: string,
  previewDevice?: StyleDevice
): string {
  if (previewDevice) return rulesFor(scope, deviceDeclarations(input, previewDevice));

  const desktop = rulesFor(scope, deviceDeclarations(input, "desktop"));
  const tablet = rulesFor(scope, deviceDeclarations(input, "tablet"));
  const mobile = rulesFor(scope, deviceDeclarations(input, "mobile"));
  const media = (range: string, rules: string) => (rules ? `@media ${range}{${rules}}` : "");

  if (desktop === tablet && tablet === mobile) return desktop;
  if (desktop === tablet) return media(RANGES.desktopTablet, desktop) + media(RANGES.mobile, mobile);
  if (tablet === mobile) return media(RANGES.desktop, desktop) + media(RANGES.tabletMobile, tablet);
  return media(RANGES.desktop, desktop) + media(RANGES.tablet, tablet) + media(RANGES.mobile, mobile);
}

export type BlockWrapperProps = {
  className: string[];
  id?: string;
  /** Scoped CSS to render in a <style> element next to the block. */
  css: string;
};

export function blockWrapperProps(
  input: Partial<BlockStyle> | null | undefined,
  blockId: string,
  previewDevice?: StyleDevice
): BlockWrapperProps {
  const style = input ?? {};
  const scope = blockScopeClass(blockId);
  const className = [scope];
  const devices: StyleDevice[] = previewDevice ? [previewDevice] : ["desktop", "tablet", "mobile"];
  if (devices.some((device) => resolveDeviceStyle(style, device).backgroundFixed)) {
    className.push("bd-bg-fixed");
  }
  className.push(...sanitizeClassNames(style.className));
  // Every value is sanitized on the way in; this only guards the <style>
  // element itself against a stray "</style>".
  const css = blockStyleCss(style, scope, previewDevice).replace(/</g, "\\3c ");
  return { className, id: sanitizeAnchorId(style.anchorId), css };
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
