import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  changeTrend,
  describeChange,
  formatRate,
  paidOrderRate,
  percentChange,
  previousRange,
  visitorConversionRate,
} from "@/lib/analytics-metrics";
import { csvCell } from "@/lib/csv";

describe("shared dashboard definitions", () => {
  it("computes conversion as orders per visitor, and paid share per order", () => {
    expect(visitorConversionRate(5, 200)).toBeCloseTo(2.5);
    expect(visitorConversionRate(5, 0)).toBe(0);
    expect(paidOrderRate(3, 4)).toBe(75);
    expect(paidOrderRate(3, 0)).toBe(0);
  });

  it("formats small rates with more precision than large ones", () => {
    expect(formatRate(0)).toBe("0%");
    expect(formatRate(2.456)).toBe("2.46%");
    expect(formatRate(42.42)).toBe("42.4%");
  });
});

describe("previous period", () => {
  it("is the equally long window ending just before this one", () => {
    const range = {
      from: new Date("2026-09-08T00:00:00.000Z"),
      to: new Date("2026-09-14T23:59:59.999Z"),
    };
    const before = previousRange(range);
    expect(before.to.getTime()).toBe(range.from.getTime() - 1);
    // Same length, to the millisecond.
    expect(before.to.getTime() - before.from.getTime()).toBe(
      range.to.getTime() - range.from.getTime()
    );
    expect(before.from.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("change against the previous period", () => {
  it("reports direction and size", () => {
    expect(percentChange(150, 100)).toEqual({ percent: 50, direction: "up" });
    expect(percentChange(50, 100)).toEqual({ percent: 50, direction: "down" });
    expect(percentChange(100, 100)).toEqual({ percent: 0, direction: "flat" });
  });

  it("stays quiet when there is nothing to compare against", () => {
    // No baseline and nothing now: a "+100%" would be a lie.
    expect(percentChange(0, 0)).toBeNull();
    expect(percentChange(12, 0)).toEqual({ percent: 100, direction: "up" });
  });

  it("falls back to the plain description when there is no change to show", () => {
    expect(describeChange(null, "Orang unik")).toBe("Orang unik");
    expect(describeChange(percentChange(150, 100), "x")).toBe("+50.0% vs periode sebelumnya");
    expect(describeChange(percentChange(50, 100), "x")).toBe("−50.0% vs periode sebelumnya");
    expect(describeChange(percentChange(100, 100), "x")).toBe("Sama dengan periode sebelumnya");
    expect(changeTrend(percentChange(50, 100))).toBe("down");
    expect(changeTrend(null)).toBe("neutral");
  });
});

describe("csv cell", () => {
  it("quotes and neutralises spreadsheet formulas", () => {
    expect(csvCell("biasa")).toBe('"biasa"');
    expect(csvCell('dia bilang "hai"')).toBe('"dia bilang ""hai"""');
    expect(csvCell("=1+1")).toBe("\"'=1+1\"");
    expect(csvCell("+62812")).toBe("\"'+62812\"");
    expect(csvCell(null)).toBe('""');
  });
});
