import { describe, expect, it } from "vitest";

import {
  bundleAvailability,
  expandBundleLines,
  type BundleComponent,
} from "@/lib/product-bundles";

const shirt = (overrides: Partial<BundleComponent> = {}): BundleComponent => ({
  productId: "shirt",
  variantId: null,
  quantity: 1,
  availableStock: 10,
  tracksStock: true,
  name: "Kaos",
  ...overrides,
});

describe("bundleAvailability", () => {
  it("is limited by whichever component runs out first", () => {
    expect(
      bundleAvailability([
        shirt({ availableStock: 10 }),
        shirt({ productId: "cap", name: "Topi", availableStock: 3 }),
      ])
    ).toBe(3);
  });

  it("divides by how many of each the bundle contains", () => {
    // Three shirts per bundle out of ten shirts is three bundles, not ten.
    expect(bundleAvailability([shirt({ availableStock: 10, quantity: 3 })])).toBe(3);
  });

  it("is zero when any component is out of stock", () => {
    expect(
      bundleAvailability([shirt(), shirt({ productId: "cap", availableStock: 0 })])
    ).toBe(0);
  });

  it("is not limited by digital components", () => {
    expect(
      bundleAvailability([
        shirt({ availableStock: 4 }),
        shirt({ productId: "ebook", tracksStock: false, availableStock: 0 }),
      ])
    ).toBe(4);
  });

  it("sells nothing when the bundle is empty", () => {
    // An order for a package containing nothing is an order for nothing.
    expect(bundleAvailability([])).toBe(0);
  });
});

describe("expandBundleLines", () => {
  it("leaves ordinary lines alone", () => {
    const lines = [{ productId: "shirt", variantId: null, name: "Kaos", quantity: 2 }];
    expect(expandBundleLines(lines, new Map())).toEqual(lines);
  });

  it("replaces a bundle with its contents, times how many were bought", () => {
    const contents = new Map([
      [
        "paket",
        [
          shirt({ quantity: 2 }),
          shirt({ productId: "cap", name: "Topi", quantity: 1 }),
        ],
      ],
    ]);
    const result = expandBundleLines(
      [{ productId: "paket", variantId: null, name: "Paket Hemat", quantity: 3 }],
      contents
    );
    expect(result).toEqual([
      { productId: "shirt", variantId: null, name: "Kaos (dari Paket Hemat)", quantity: 6 },
      { productId: "cap", variantId: null, name: "Topi (dari Paket Hemat)", quantity: 3 },
    ]);
  });

  it("adds up a product bought both loose and inside a bundle", () => {
    const contents = new Map([["paket", [shirt({ quantity: 1 })]]]);
    const result = expandBundleLines(
      [
        { productId: "shirt", variantId: null, name: "Kaos", quantity: 1 },
        { productId: "paket", variantId: null, name: "Paket", quantity: 2 },
      ],
      contents
    );
    // One reservation of three, not two that can race each other.
    expect(result).toEqual([
      { productId: "shirt", variantId: null, name: "Kaos", quantity: 3 },
    ]);
  });

  it("keeps a component's variant distinct from the plain product", () => {
    const contents = new Map([
      ["paket", [shirt({ variantId: "merah", name: "Kaos Merah" })]],
    ]);
    const result = expandBundleLines(
      [
        { productId: "shirt", variantId: null, name: "Kaos", quantity: 1 },
        { productId: "paket", variantId: null, name: "Paket", quantity: 1 },
      ],
      contents
    );
    expect(result).toHaveLength(2);
  });

  it("reserves nothing for a digital component", () => {
    const contents = new Map([
      ["paket", [shirt({ productId: "ebook", tracksStock: false })]],
    ]);
    expect(
      expandBundleLines(
        [{ productId: "paket", variantId: null, name: "Paket", quantity: 1 }],
        contents
      )
    ).toEqual([]);
  });
});
