import type { z } from "zod";

import {
  blockDataSchemas,
  type Block,
  type BlockType,
} from "./schema";
import type { StyleDevice } from "./style";

/**
 * Per-device layout choices from the Konten tab: a hero can be "split" on
 * desktop and "centered" on mobile, a grid 4 columns on desktop and 2 on
 * tablet — without duplicating the block.
 *
 * Only the fields listed here can differ. They are all layout choices
 * (enums, column counts, show/hide toggles); text, images and links stay
 * shared so a page never says different things on different screens.
 *
 * Blocks that would misbehave when rendered more than once on the public
 * page are left out: forms (duplicate inputs), iframes (loaded per copy),
 * FAQ (item anchors are ids), header/footer (site-wide, own mobile layout),
 * custom HTML and the floating WhatsApp button.
 */
export const RESPONSIVE_CONTENT_FIELDS: Partial<Record<BlockType, readonly string[]>> = {
  MENU: ["layout", "columns", "align", "showDescriptions"],
  HERO: ["layout", "height", "mediaPosition", "overlay", "align", "buttonStyle"],
  TEXT: ["layout", "imagePosition", "tone", "align"],
  COLUMNS: ["layout", "columns", "gap", "align", "cardStyle", "verticalAlign"],
  IMAGE: ["width", "aspectRatio", "objectFit", "frame", "captionPosition", "align"],
  CTA: ["layout", "tone", "buttonStyle", "imagePosition", "height", "overlay", "align"],
  FEATURE_GRID: ["layout", "columns", "cardStyle", "align", "iconStyle"],
  STATS: ["layout", "tone", "columns", "align"],
  STEPS: ["layout", "tone", "columns", "align", "markerStyle"],
  PRICING: ["layout", "tone", "columns", "align"],
  TESTIMONIAL: ["layout", "tone", "columns", "align", "showQuotes"],
  LOGOS: ["layout", "tone", "columns", "logoSize", "align", "grayscale"],
  GALLERY: ["layout", "columns", "gap", "aspectRatio", "frame", "captionPosition", "hoverEffect", "align"],
  IMAGE_SLIDER: ["aspectRatio", "fit", "frame", "showArrows", "showDots", "showCaption", "align"],
  BANNER: ["layout", "tone", "width", "align", "compact", "showIcon"],
  DIVIDER: ["variant", "width", "thickness", "spacing", "align"],
  PRODUCT_SHOWCASE: ["layout", "columns", "imageAspect", "cardStyle", "imageFit", "gap", "align", "showImages", "showDescription", "showMeta", "compact"],
  COURSE_SHOWCASE: ["layout", "columns", "imageAspect", "cardStyle", "imageFit", "gap", "align", "showImages", "showDescription", "showMeta", "compact"],
  BLOG_SHOWCASE: ["layout", "columns", "imageAspect", "cardStyle", "imageFit", "gap", "align", "showImages", "showDescription", "showMeta", "compact"],
  MEMBERSHIP_SHOWCASE: ["layout", "columns", "imageAspect", "cardStyle", "imageFit", "gap", "align", "showImages", "showDescription", "showMeta", "compact"],
  AFFILIATE_CTA: ["layout", "tone", "width", "buttonStyle", "showStats", "showBenefits", "showImage", "compact"],
  BUTTON: ["layout", "size", "width", "shape", "align", "gap", "columns", "fullWidthButtons", "equalWidth", "showIcons", "showDescriptions"],
  BIO_PROFILE: ["layout", "width", "avatarSize", "coverHeight", "align", "linkLayout", "socialStyle", "compact"],
  COUNTDOWN: ["layout", "showLabels", "showSeconds", "align"],
  COMPARISON_TABLE: ["layout", "align"],
  MARQUEE: ["size", "speed", "align"],
  TABS: ["variant", "align"],
};

export function responsiveFieldsFor(type: BlockType): readonly string[] {
  return RESPONSIVE_CONTENT_FIELDS[type] ?? [];
}

type Overrides = Record<string, unknown>;
type WithResponsive = { responsive?: { tablet?: Overrides; mobile?: Overrides } };

function fieldSchema(type: BlockType, key: string): z.ZodTypeAny | undefined {
  const schema = blockDataSchemas[type] as unknown as z.AnyZodObject;
  return schema.shape?.[key];
}

/** The overrides a device level stores, keeping only valid, allowed fields. */
export function deviceOverrides(
  type: BlockType,
  data: Block["data"],
  device: Exclude<StyleDevice, "desktop">
): Overrides {
  const stored = (data as WithResponsive).responsive?.[device];
  if (!stored || typeof stored !== "object") return {};
  const out: Overrides = {};
  for (const key of responsiveFieldsFor(type)) {
    if (!(key in stored)) continue;
    const parsed = fieldSchema(type, key)?.safeParse(stored[key]);
    if (parsed?.success) out[key] = parsed.data;
  }
  return out;
}

/** The block's data as a device shows it: desktop, then tablet, then mobile. */
export function resolveBlockDataForDevice<T extends Block["data"]>(
  type: BlockType,
  data: T,
  device: StyleDevice
): T {
  if (device === "desktop") return data;
  const tablet = deviceOverrides(type, data, "tablet");
  const mobile = device === "mobile" ? deviceOverrides(type, data, "mobile") : {};
  if (Object.keys(tablet).length === 0 && Object.keys(mobile).length === 0) return data;
  return { ...data, ...tablet, ...mobile };
}

function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Applies an edit made in the Konten form while `device` is previewed. The
 * form was given the device's resolved data and hands back the whole object;
 * whatever changed is routed: an allowed layout field becomes an override of
 * this device (or drops the override when it equals what the device would
 * inherit anyway), everything else lands on the shared data.
 */
export function applyContentEdit<T extends Block["data"]>(
  type: BlockType,
  data: T,
  device: StyleDevice,
  next: T
): T {
  if (device === "desktop") return next;

  const allowed = new Set(responsiveFieldsFor(type));
  const current = resolveBlockDataForDevice(type, data, device) as Record<string, unknown>;
  const inherited = resolveBlockDataForDevice(
    type,
    data,
    device === "mobile" ? "tablet" : "desktop"
  ) as Record<string, unknown>;
  const base: Record<string, unknown> = { ...data };
  const overrides: Overrides = { ...deviceOverrides(type, data, device) };

  for (const [key, value] of Object.entries(next as Record<string, unknown>)) {
    if (key === "responsive") continue;
    if (same(value, current[key])) continue;
    if (allowed.has(key)) {
      if (same(value, inherited[key])) delete overrides[key];
      else overrides[key] = value;
    } else {
      base[key] = value;
    }
  }

  const responsive = { ...((data as WithResponsive).responsive ?? {}), [device]: overrides };
  return { ...base, responsive } as T;
}

/** Drops one override (or all of them) for a device. */
export function clearContentOverride<T extends Block["data"]>(
  data: T,
  device: Exclude<StyleDevice, "desktop">,
  key?: string
): T {
  const responsive = { ...((data as WithResponsive).responsive ?? {}) };
  if (key) {
    const level = { ...(responsive[device] ?? {}) };
    delete level[key];
    responsive[device] = level;
  } else {
    responsive[device] = {};
  }
  return { ...data, responsive } as T;
}

export type ContentVariant<T> = { devices: StyleDevice[]; data: T };

/**
 * The distinct versions of a block the public page needs. A block without
 * overrides has one; otherwise devices that resolve to the same data share
 * a version, so at most three are rendered.
 */
export function contentVariants<T extends Block["data"]>(type: BlockType, data: T): ContentVariant<T>[] {
  const variants: ContentVariant<T>[] = [];
  for (const device of ["desktop", "tablet", "mobile"] as const) {
    const resolved = resolveBlockDataForDevice(type, data, device);
    const match = variants.find((variant) => same(variant.data, resolved));
    if (match) match.devices.push(device);
    else variants.push({ devices: [device], data: resolved });
  }
  return variants;
}

/** "mediaPosition" → "Media position", for listing overridden fields. */
export function humanizeField(key: string) {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
