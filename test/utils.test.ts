import { describe, expect, it } from "vitest";

import { cn, formatPrice, getInitials } from "@/lib/utils";

describe("formatPrice", () => {
  it("formats integer rupiah with thousands separators", () => {
    expect(formatPrice(150000)).toBe("Rp 150.000");
    expect(formatPrice(0)).toBe("Rp 0");
    expect(formatPrice(1234567)).toBe("Rp 1.234.567");
  });

  it("rounds fractional amounts", () => {
    expect(formatPrice(99.6)).toBe("Rp 100");
  });
});

describe("getInitials", () => {
  it("takes up to two initials, uppercased", () => {
    expect(getInitials("Ada Lovelace")).toBe("AL");
    expect(getInitials("buildery")).toBe("B");
  });

  it("handles three-word names by taking the first two", () => {
    expect(getInitials("Grace Brewster Hopper")).toBe("GB");
  });

  it("falls back to 'U' when there is no name", () => {
    expect(getInitials(null)).toBe("U");
    expect(getInitials("")).toBe("U");
  });
});

describe("cn", () => {
  it("merges class names and resolves Tailwind conflicts", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b");
  });
});
