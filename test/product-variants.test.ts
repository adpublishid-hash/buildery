import { describe, expect, it } from "vitest";

import {
  findVariantByOptions,
  MAX_VARIANT_COMBINATIONS,
  planVariantMatrix,
  readVariantAxes,
  readVariantOptions,
  variantAvailability,
  variantAxisViews,
  variantCombinations,
  variantName,
  variantOptionKey,
  variantPriceRange,
} from "@/lib/product-variants";

describe("readVariantAxes", () => {
  it("keeps well-formed axes and drops the rest", () => {
    expect(
      readVariantAxes([
        { name: "Warna", values: ["Hitam", "Putih"] },
        { name: "  ", values: ["x"] },
        { name: "Kosong", values: [] },
        "bukan objek",
      ])
    ).toEqual([{ name: "Warna", values: ["Hitam", "Putih"] }]);
  });

  it("refuses duplicate axis names and duplicate values", () => {
    // Two identical values would generate two identical combinations.
    expect(
      readVariantAxes([
        { name: "Ukuran", values: ["S", "S", "M"] },
        { name: "ukuran", values: ["L"] },
      ])
    ).toEqual([{ name: "Ukuran", values: ["S", "M"] }]);
  });

  it("treats anything that is not a list as no axes at all", () => {
    expect(readVariantAxes(null)).toEqual([]);
    expect(readVariantAxes({ name: "Warna" })).toEqual([]);
  });
});

describe("variantCombinations", () => {
  const axes = [
    { name: "Warna", values: ["Hitam", "Putih"] },
    { name: "Ukuran", values: ["S", "M", "L"] },
  ];

  it("produces every combination once", () => {
    const combinations = variantCombinations(axes);
    expect(combinations).toHaveLength(6);
    expect(new Set(combinations.map(variantOptionKey)).size).toBe(6);
    expect(combinations[0]).toEqual({ Warna: "Hitam", Ukuran: "S" });
  });

  it("stops before a shop generates thousands of rows by accident", () => {
    const huge = [
      { name: "A", values: Array.from({ length: 20 }, (_, i) => `a${i}`) },
      { name: "B", values: Array.from({ length: 20 }, (_, i) => `b${i}`) },
    ];
    expect(variantCombinations(huge).length).toBeLessThanOrEqual(
      MAX_VARIANT_COMBINATIONS
    );
  });

  it("has nothing to combine without axes", () => {
    expect(variantCombinations([])).toEqual([]);
  });
});

describe("variantOptionKey", () => {
  it("matches the same choice however the axes are ordered or cased", () => {
    expect(variantOptionKey({ Warna: "Hitam", Ukuran: "XL" })).toBe(
      variantOptionKey({ Ukuran: "xl", warna: "hitam" })
    );
  });
});

describe("planVariantMatrix", () => {
  const axes = [
    { name: "Warna", values: ["Hitam", "Putih"] },
    { name: "Ukuran", values: ["S", "M"] },
  ];

  it("creates only what is missing", () => {
    const plan = planVariantMatrix(axes, [
      { id: "v1", name: "Hitam / S", options: { Warna: "Hitam", Ukuran: "S" } },
    ]);
    expect(plan.create).toHaveLength(3);
    expect(plan.create.map((entry) => entry.name)).not.toContain("Hitam / S");
    expect(plan.rename).toEqual([]);
  });

  it("renames a variant whose name has drifted from its options", () => {
    const plan = planVariantMatrix(axes, [
      { id: "v1", name: "hitam-kecil", options: { Warna: "Hitam", Ukuran: "S" } },
    ]);
    expect(plan.rename).toEqual([{ id: "v1", name: "Hitam / S" }]);
  });

  it("reports a combination the axes no longer describe instead of deleting it", () => {
    const plan = planVariantMatrix(axes, [
      { id: "v9", name: "Merah / S", options: { Warna: "Merah", Ukuran: "S" } },
    ]);
    // It may still hold stock; a mistyped axis value must not destroy it.
    expect(plan.orphaned).toEqual([{ id: "v9", name: "Merah / S" }]);
  });

  it("ignores legacy variants that carry no options at all", () => {
    const plan = planVariantMatrix(axes, [
      { id: "old", name: "Varian lama", options: {} },
    ]);
    expect(plan.orphaned).toEqual([]);
    expect(plan.create).toHaveLength(4);
  });
});

describe("variantName", () => {
  it("names a combination in the axis order the merchant set", () => {
    expect(
      variantName(
        [
          { name: "Warna", values: ["Hitam"] },
          { name: "Ukuran", values: ["XL"] },
        ],
        { Ukuran: "XL", Warna: "Hitam" }
      )
    ).toBe("Hitam / XL");
  });
});

describe("variantAvailability", () => {
  const axes = [
    { name: "Warna", values: ["Hitam", "Putih"] },
    { name: "Ukuran", values: ["S", "M"] },
  ];
  const variants = [
    { id: "a", stock: 3, options: { Warna: "Hitam", Ukuran: "S" } },
    { id: "b", stock: 0, options: { Warna: "Hitam", Ukuran: "M" } },
    { id: "c", stock: 0, options: { Warna: "Putih", Ukuran: "S" } },
    { id: "d", stock: 0, options: { Warna: "Putih", Ukuran: "M" } },
  ];

  it("marks a value out of stock only when nothing using it is left", () => {
    const [warna, ukuran] = variantAvailability(axes, variants);
    expect(warna.values).toEqual([
      { value: "Hitam", inStock: true },
      { value: "Putih", inStock: false },
    ]);
    expect(ukuran.values).toEqual([
      { value: "S", inStock: true },
      { value: "M", inStock: false },
    ]);
  });
});

describe("findVariantByOptions", () => {
  const variants = [
    { id: "a", options: { Warna: "Hitam", Ukuran: "S" } },
    { id: "b", options: { Warna: "Putih", Ukuran: "M" } },
  ];

  it("resolves a full selection to its variant", () => {
    expect(findVariantByOptions(variants, { Ukuran: "M", Warna: "Putih" })?.id).toBe("b");
  });

  it("returns nothing for a partial or unknown selection", () => {
    expect(findVariantByOptions(variants, { Warna: "Hitam" })).toBeNull();
    expect(findVariantByOptions(variants, {})).toBeNull();
  });
});

describe("readVariantOptions", () => {
  it("drops empty keys and values", () => {
    expect(readVariantOptions({ Warna: "Hitam", "": "x", Ukuran: "" })).toEqual({
      Warna: "Hitam",
    });
  });
});

describe("variantPriceRange", () => {
  it("reports one price when every variant costs the same", () => {
    expect(
      variantPriceRange(100_000, [{ price: null }, { price: 100_000 }])
    ).toEqual({ min: 100_000, max: 100_000, varies: false });
  });

  it("spans the cheapest and dearest variant", () => {
    // A card showing only the base price misleads the shopper until they click.
    expect(
      variantPriceRange(100_000, [{ price: null }, { price: 150_000 }])
    ).toEqual({ min: 100_000, max: 150_000, varies: true });
  });

  it("uses a valid variant promotion and ignores zero", () => {
    expect(
      variantPriceRange(100_000, [
        { price: 120_000, discountPrice: 90_000 },
        { price: 100_000, discountPrice: 0 },
      ])
    ).toEqual({ min: 90_000, max: 100_000, varies: true });
  });

  it("ignores variants that are switched off", () => {
    expect(
      variantPriceRange(100_000, [
        { price: 100_000 },
        { price: 900_000, isActive: false },
      ])
    ).toEqual({ min: 100_000, max: 100_000, varies: false });
  });

  it("falls back to the product's own price when there are no variants", () => {
    expect(variantPriceRange(75_000, [])).toEqual({
      min: 75_000,
      max: 75_000,
      varies: false,
    });
  });
});

describe("variantAxisViews", () => {
  const axes = [
    { name: "Warna", values: ["Hitam", "Putih"] },
    { name: "Ukuran", values: ["S", "M"] },
  ];

  it("turns a colour axis into swatches when each value has its own photo", () => {
    const [warna, ukuran] = variantAxisViews(axes, [
      { id: "a", stock: 2, options: { Warna: "Hitam", Ukuran: "S" }, imageUrl: "/h.jpg" },
      { id: "b", stock: 0, options: { Warna: "Hitam", Ukuran: "M" }, imageUrl: "/h.jpg" },
      { id: "c", stock: 1, options: { Warna: "Putih", Ukuran: "S" }, imageUrl: "/p.jpg" },
      { id: "d", stock: 0, options: { Warna: "Putih", Ukuran: "M" }, imageUrl: "/p.jpg" },
    ]);

    expect(warna.values).toEqual([
      { value: "Hitam", inStock: true, imageUrl: "/h.jpg" },
      { value: "Putih", inStock: true, imageUrl: "/p.jpg" },
    ]);
    // Size shares the colour photos, so a row of identical thumbnails would
    // say nothing — it stays as labels.
    expect(ukuran.values.every((entry) => entry.imageUrl === null)).toBe(true);
  });

  it("keeps labels when only some values have a photo", () => {
    const [warna] = variantAxisViews(axes, [
      { id: "a", stock: 1, options: { Warna: "Hitam" }, imageUrl: "/h.jpg" },
      { id: "b", stock: 1, options: { Warna: "Putih" } },
    ]);
    expect(warna.values.every((entry) => entry.imageUrl === null)).toBe(true);
  });

  it("marks a value out of stock only when nothing using it is left", () => {
    const [warna] = variantAxisViews(axes, [
      { id: "a", stock: 0, options: { Warna: "Hitam", Ukuran: "S" } },
      { id: "b", stock: 3, options: { Warna: "Putih", Ukuran: "S" } },
    ]);
    expect(warna.values).toEqual([
      { value: "Hitam", inStock: false, imageUrl: null },
      { value: "Putih", inStock: true, imageUrl: null },
    ]);
  });

  it("does not offer a variant the merchant switched off", () => {
    const [warna] = variantAxisViews(axes, [
      { id: "a", stock: 5, options: { Warna: "Hitam" }, isActive: false },
      { id: "b", stock: 1, options: { Warna: "Putih" } },
    ]);
    expect(warna.values[0]).toMatchObject({ value: "Hitam", inStock: false });
  });
});
