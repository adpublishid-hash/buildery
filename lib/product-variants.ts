import type { Prisma } from "@prisma/client";

/**
 * Variants as combinations of option axes.
 *
 * A variant used to be a row with a free-text name, so "Hitam / XL" was a
 * string the merchant had to type consistently twelve times for three colours
 * and four sizes — and the storefront could only offer that flat list back.
 * An axis list on the product plus the chosen value per axis on each variant
 * gives both sides something to group by.
 *
 * Pure functions: the dashboard, the storefront and the tests all agree on one
 * definition of what a combination is and what it is called.
 */

export type VariantAxis = { name: string; values: string[] };
/** The value chosen on each axis, e.g. `{ Warna: "Hitam", Ukuran: "XL" }`. */
export type VariantOptionValues = Record<string, string>;

export const MAX_VARIANT_AXES = 3;
export const MAX_VALUES_PER_AXIS = 20;
/** Postgres will hold more; a shop that needs more needs separate products. */
export const MAX_VARIANT_COMBINATIONS = 100;

function cleanLabel(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Reads the axis list off a product, ignoring anything malformed. */
export function readVariantAxes(value: Prisma.JsonValue | null | undefined): VariantAxis[] {
  if (!Array.isArray(value)) return [];
  const axes: VariantAxis[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const name = cleanLabel(record.name, 40);
    if (!name) continue;
    const rawValues = Array.isArray(record.values) ? record.values : [];
    const values: string[] = [];
    for (const candidate of rawValues) {
      const label = cleanLabel(candidate, 40);
      // Duplicates would produce two identical combinations.
      if (label && !values.includes(label)) values.push(label);
      if (values.length >= MAX_VALUES_PER_AXIS) break;
    }
    if (values.length === 0) continue;
    if (axes.some((axis) => axis.name.toLowerCase() === name.toLowerCase())) continue;
    axes.push({ name, values });
    if (axes.length >= MAX_VARIANT_AXES) break;
  }
  return axes;
}

/** The value chosen per axis on one variant. */
export function readVariantOptions(
  value: Prisma.JsonValue | null | undefined
): VariantOptionValues {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const options: VariantOptionValues = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const axis = cleanLabel(key, 40);
    const chosen = cleanLabel(raw, 40);
    if (axis && chosen) options[axis] = chosen;
  }
  return options;
}

/** Every combination the axes describe, in a stable order. */
export function variantCombinations(axes: VariantAxis[]): VariantOptionValues[] {
  if (axes.length === 0) return [];
  let combinations: VariantOptionValues[] = [{}];
  for (const axis of axes) {
    const next: VariantOptionValues[] = [];
    for (const base of combinations) {
      for (const value of axis.values) {
        next.push({ ...base, [axis.name]: value });
        if (next.length > MAX_VARIANT_COMBINATIONS) return next.slice(0, MAX_VARIANT_COMBINATIONS);
      }
    }
    combinations = next;
  }
  return combinations;
}

/**
 * A stable key for one combination, so a variant can be matched to it however
 * the axes happen to be ordered in the JSON.
 */
export function variantOptionKey(options: VariantOptionValues): string {
  return Object.entries(options)
    .map(([axis, value]) => [axis.toLowerCase(), value.toLowerCase()] as const)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([axis, value]) => `${axis}=${value}`)
    .join("|");
}

/** The name shown everywhere a variant is listed, built from its axes. */
export function variantName(axes: VariantAxis[], options: VariantOptionValues): string {
  const ordered = axes.length
    ? axes.map((axis) => options[axis.name]).filter(Boolean)
    : Object.values(options);
  return ordered.join(" / ");
}

export type ExistingVariant = {
  id: string;
  name: string;
  options: Prisma.JsonValue;
};

export type VariantPlan = {
  /** Combinations that have no variant yet. */
  create: { options: VariantOptionValues; name: string }[];
  /** Variants whose generated name has drifted from their options. */
  rename: { id: string; name: string }[];
  /** Variants whose combination is no longer described by the axes. */
  orphaned: { id: string; name: string }[];
};

/**
 * Works out what generating the matrix would do, without doing it.
 *
 * Orphans are reported rather than deleted: they may hold stock, and a
 * mistyped axis value should not silently destroy inventory.
 */
export function planVariantMatrix(
  axes: VariantAxis[],
  existing: ExistingVariant[]
): VariantPlan {
  const byKey = new Map<string, ExistingVariant>();
  for (const variant of existing) {
    const key = variantOptionKey(readVariantOptions(variant.options));
    if (key) byKey.set(key, variant);
  }

  const plan: VariantPlan = { create: [], rename: [], orphaned: [] };
  const wanted = new Set<string>();

  for (const options of variantCombinations(axes)) {
    const key = variantOptionKey(options);
    wanted.add(key);
    const name = variantName(axes, options);
    const match = byKey.get(key);
    if (!match) plan.create.push({ options, name });
    else if (match.name !== name) plan.rename.push({ id: match.id, name });
  }

  for (const [key, variant] of byKey) {
    if (!wanted.has(key)) plan.orphaned.push({ id: variant.id, name: variant.name });
  }

  return plan;
}

/**
 * Groups variants for the storefront: one selector per axis, and for each
 * value whether anything in stock still uses it.
 */
export function variantAvailability(
  axes: VariantAxis[],
  variants: { id: string; stock: number; options: Prisma.JsonValue }[]
) {
  const parsed = variants.map((variant) => ({
    ...variant,
    values: readVariantOptions(variant.options),
  }));

  return axes.map((axis) => ({
    name: axis.name,
    values: axis.values.map((value) => ({
      value,
      inStock: parsed.some(
        (variant) => variant.values[axis.name] === value && variant.stock > 0
      ),
    })),
  }));
}

/** The variant matching one full selection, if there is one. */
export function findVariantByOptions<T extends { options: Prisma.JsonValue }>(
  variants: T[],
  selection: VariantOptionValues
): T | null {
  const key = variantOptionKey(selection);
  if (!key) return null;
  return (
    variants.find(
      (variant) => variantOptionKey(readVariantOptions(variant.options)) === key
    ) ?? null
  );
}

export type PricedVariant = {
  price: number | null;
  discountPrice?: number | null;
  isActive?: boolean;
  stock?: number;
};

/** Effective sell price after a variant-specific promotion. */
export function effectiveVariantPrice(
  basePrice: number,
  variant: Pick<PricedVariant, "price" | "discountPrice">
) {
  const regular = variant.price ?? basePrice;
  return variant.discountPrice != null &&
    variant.discountPrice > 0 &&
    variant.discountPrice < regular
    ? variant.discountPrice
    : regular;
}

export type VariantPriceRange = {
  min: number;
  max: number;
  /** True when the variants do not all cost the same. */
  varies: boolean;
};

/**
 * What a product actually costs, across its variants.
 *
 * A card showing one price is a lie when the S costs 100.000 and the XXL
 * 150.000 — the shopper finds out after clicking. A variant with no price of
 * its own inherits the product's.
 */
export function variantPriceRange(
  basePrice: number,
  variants: PricedVariant[]
): VariantPriceRange {
  const sellable = variants.filter((variant) => variant.isActive !== false);
  if (sellable.length === 0) {
    return { min: basePrice, max: basePrice, varies: false };
  }

  const prices = sellable.map((variant) => effectiveVariantPrice(basePrice, variant));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return { min, max, varies: min !== max };
}

export type AxisValueView = {
  value: string;
  inStock: boolean;
  /** A photo to show instead of the value's name, when one distinguishes it. */
  imageUrl: string | null;
};

/**
 * Groups variants for the storefront: one selector per axis, each value marked
 * for stock and, where the variants supply one, carrying a photo.
 *
 * The photo is what turns a list of colour names into swatches, using the
 * images the merchant already attached to the variants.
 */
export function variantAxisViews(
  axes: VariantAxis[],
  variants: {
    id: string;
    stock: number;
    options: Prisma.JsonValue;
    imageUrl?: string | null;
    isActive?: boolean;
  }[]
): { name: string; values: AxisValueView[] }[] {
  const parsed = variants
    .filter((variant) => variant.isActive !== false)
    .map((variant) => ({ ...variant, values: readVariantOptions(variant.options) }));

  return axes.map((axis) => {
    const images = new Map<string, string>();
    for (const variant of parsed) {
      const value = variant.values[axis.name];
      const url = variant.imageUrl?.trim();
      if (value && url && !images.has(value)) images.set(value, url);
    }
    // Only useful when the photos actually differ per value; one shared photo
    // across every size makes a row of identical thumbnails.
    const distinct = new Set(images.values()).size;
    const useImages = distinct > 1 && images.size === axis.values.length;

    return {
      name: axis.name,
      values: axis.values.map((value) => ({
        value,
        inStock: parsed.some(
          (variant) => variant.values[axis.name] === value && variant.stock > 0
        ),
        imageUrl: useImages ? (images.get(value) ?? null) : null,
      })),
    };
  });
}
