import { describe, expect, it } from "vitest";

import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and hyphenates words", () => {
    expect(slugify("Acme Studio")).toBe("acme-studio");
  });

  it("strips punctuation and quotes", () => {
    expect(slugify("Buildery's #1 Site!")).toBe("builderys-1-site");
  });

  it("collapses repeated separators", () => {
    expect(slugify("a   --  b")).toBe("a-b");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  -- hello -- ")).toBe("hello");
  });

  it("caps length at 40 characters", () => {
    const long = "x".repeat(80);
    expect(slugify(long).length).toBeLessThanOrEqual(40);
  });

  it("returns an empty string for symbol-only input", () => {
    expect(slugify("!@#$%")).toBe("");
  });
});
