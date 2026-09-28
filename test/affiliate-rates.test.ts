import { describe, expect, it } from "vitest";

import {
  blendedRateBps,
  commissionAmount,
  parseOptionalPercent,
  percentToBps,
  resolveCommissionRateBps,
} from "@/lib/affiliate-rates";

describe("commission rate resolution", () => {
  it("uses the program default when nothing else is set", () => {
    expect(resolveCommissionRateBps({ affiliatePercent: null, itemRateBps: null, programPercent: 20 })).toBe(2000);
  });

  it("prefers the item rate over the program default", () => {
    expect(resolveCommissionRateBps({ affiliatePercent: null, itemRateBps: 3500, programPercent: 20 })).toBe(3500);
  });

  it("lets a partner's negotiated rate beat item and program rates", () => {
    expect(resolveCommissionRateBps({ affiliatePercent: 10, itemRateBps: 3500, programPercent: 20 })).toBe(1000);
  });

  it("treats an explicit 0% as a real rate, not as unset", () => {
    expect(resolveCommissionRateBps({ affiliatePercent: null, itemRateBps: 0, programPercent: 20 })).toBe(0);
    expect(resolveCommissionRateBps({ affiliatePercent: 0, itemRateBps: 3000, programPercent: 20 })).toBe(0);
  });

  it("clamps out-of-range values", () => {
    expect(resolveCommissionRateBps({ affiliatePercent: 150, itemRateBps: null, programPercent: 20 })).toBe(10_000);
    expect(percentToBps(null)).toBeNull();
    expect(percentToBps(12)).toBe(1200);
  });
});

describe("blended order rate", () => {
  it("returns null when no line overrides the default", () => {
    expect(blendedRateBps([{ amount: 100_000, percent: null }], 20)).toBeNull();
  });

  it("weights each line's rate by its value", () => {
    // 100k at 30% and 300k at the 20% default → (30k + 60k) / 400k = 22.5%
    expect(
      blendedRateBps(
        [
          { amount: 100_000, percent: 30 },
          { amount: 300_000, percent: null },
        ],
        20
      )
    ).toBe(2250);
  });

  it("ignores zero-value lines", () => {
    expect(blendedRateBps([{ amount: 0, percent: 90 }, { amount: 50_000, percent: 10 }], 20)).toBe(1000);
  });

  it("computes amounts in whole currency units, rounding down", () => {
    expect(commissionAmount(99_999, 2250)).toBe(22_499);
    expect(commissionAmount(-5, 2000)).toBe(0);
  });
});

describe("percent form input", () => {
  it("accepts blank as 'use default' and whole numbers 0-100", () => {
    expect(parseOptionalPercent("")).toEqual({ ok: true, value: null });
    expect(parseOptionalPercent(" 15 ")).toEqual({ ok: true, value: 15 });
    expect(parseOptionalPercent("0")).toEqual({ ok: true, value: 0 });
  });

  it("rejects decimals, negatives, and values over 100", () => {
    expect(parseOptionalPercent("12.5").ok).toBe(false);
    expect(parseOptionalPercent("-1").ok).toBe(false);
    expect(parseOptionalPercent("101").ok).toBe(false);
    expect(parseOptionalPercent("abc").ok).toBe(false);
  });
});
