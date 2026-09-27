import { describe, expect, it } from "vitest";

import { normalizeProductCopy } from "@/lib/ai/product-copy";

describe("normalizeProductCopy", () => {
  it("trims each field and keeps copy that already fits", () => {
    const copy = normalizeProductCopy({
      description: "  Brownies fudgy panggang harian.  ",
      details: "- 9x9 cm\n- Tanpa pengawet",
      metaTitle: "Brownies Fudgy Panggang Harian",
      metaDescription: "Brownies fudgy yang dipanggang setiap pagi.",
    });

    expect(copy.description).toBe("Brownies fudgy panggang harian.");
    expect(copy.details).toBe("- 9x9 cm\n- Tanpa pengawet");
    expect(copy.metaTitle).toBe("Brownies Fudgy Panggang Harian");
  });

  it("clips an over-long SEO title at a word boundary", () => {
    const copy = normalizeProductCopy({
      metaTitle:
        "Brownies Fudgy Panggang Harian Tanpa Pengawet Dari Dapur Rumahan Bandung Sejak Lama",
      metaDescription: "",
      description: "",
      details: "",
    });

    expect(copy.metaTitle.length).toBeLessThanOrEqual(60);
    // A boundary cut, not a chopped word.
    expect(copy.metaTitle.endsWith(" ")).toBe(false);
    expect(copy.metaTitle.split(" ").pop()).not.toBe("Ruma");
  });

  it("clips a long meta description to the search-result limit", () => {
    const copy = normalizeProductCopy({
      metaDescription: "kata ".repeat(80),
      metaTitle: "",
      description: "",
      details: "",
    });

    expect(copy.metaDescription.length).toBeLessThanOrEqual(155);
  });

  it("falls back to empty strings for a malformed response", () => {
    expect(normalizeProductCopy(null)).toEqual({
      description: "",
      details: "",
      metaTitle: "",
      metaDescription: "",
    });
    expect(normalizeProductCopy({ description: 42, details: [] })).toEqual({
      description: "",
      details: "",
      metaTitle: "",
      metaDescription: "",
    });
  });

  it("hard-cuts a single long word rather than returning nothing", () => {
    const copy = normalizeProductCopy({
      metaTitle: "A".repeat(90),
      metaDescription: "",
      description: "",
      details: "",
    });

    expect(copy.metaTitle).toHaveLength(60);
  });
});
