import { describe, expect, it } from "vitest";

import {
  cartCount,
  effectivePrice,
  effectiveProductVariantPrice,
  generateOrderNumber,
  hasDiscount,
} from "@/lib/store";

describe("effectivePrice", () => {
  it("uses the discount price when it is lower", () => {
    expect(effectivePrice({ price: 180000, discountPrice: 150000 })).toBe(
      150000
    );
  });

  it("ignores a discount price that is not lower", () => {
    expect(effectivePrice({ price: 100000, discountPrice: 120000 })).toBe(
      100000
    );
    expect(effectivePrice({ price: 100000, discountPrice: 0 })).toBe(100000);
  });

  it("falls back to the normal price when there is no discount", () => {
    expect(effectivePrice({ price: 90000, discountPrice: null })).toBe(90000);
  });
});

describe("hasDiscount", () => {
  it("is true only when the effective price is below the list price", () => {
    expect(hasDiscount({ price: 180000, discountPrice: 150000 })).toBe(true);
    expect(hasDiscount({ price: 180000, discountPrice: null })).toBe(false);
  });
});

describe("effectiveProductVariantPrice", () => {
  it("uses the variant promotion when the variant has its own price", () => {
    expect(
      effectiveProductVariantPrice(
        { price: 100_000, discountPrice: 80_000 },
        { price: 120_000, discountPrice: 90_000 }
      )
    ).toBe(90_000);
  });

  it("inherits the product promotion when the variant has no price", () => {
    expect(
      effectiveProductVariantPrice(
        { price: 100_000, discountPrice: 80_000 },
        { price: null, discountPrice: null }
      )
    ).toBe(80_000);
  });
});

describe("cartCount", () => {
  it("sums the quantities of all line items", () => {
    expect(
      cartCount({
        workspaceId: "w1",
        couponCode: null,
        items: [
          { productId: "a", quantity: 2 },
          { productId: "b", quantity: 3 },
        ],
      })
    ).toBe(5);
  });

  it("is zero for an empty cart", () => {
    expect(
      cartCount({ workspaceId: null, couponCode: null, items: [] })
    ).toBe(0);
  });
});

describe("generateOrderNumber", () => {
  it("matches the ORD-XXXXXXXX shape", () => {
    expect(generateOrderNumber()).toMatch(/^ORD-[A-Z0-9]+$/);
  });

  it("produces distinct values", () => {
    const a = generateOrderNumber();
    const b = generateOrderNumber();
    expect(a).not.toBe(b);
  });
});
