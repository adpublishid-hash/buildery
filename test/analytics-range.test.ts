import { describe, expect, it } from "vitest";

import {
  eachDayKey,
  formatDayKey,
  resolveRange,
} from "@/lib/analytics-range";

describe("resolveRange", () => {
  it("defaults to the last 7 days", () => {
    const r = resolveRange({});
    expect(r.key).toBe("7d");
    expect(r.days).toBe(7);
  });

  it("handles the 'today' range as a single day", () => {
    const r = resolveRange({ range: "today" });
    expect(r.key).toBe("today");
    expect(r.days).toBe(1);
  });

  it("handles the 30-day range", () => {
    const r = resolveRange({ range: "30d" });
    expect(r.key).toBe("30d");
    expect(r.days).toBe(30);
  });

  it("accepts a valid custom range", () => {
    const r = resolveRange({
      range: "custom",
      from: "2026-05-01",
      to: "2026-05-10",
    });
    expect(r.key).toBe("custom");
    expect(r.days).toBe(10);
  });

  it("falls back to 7d when a custom range is inverted or missing", () => {
    expect(resolveRange({ range: "custom" }).key).toBe("7d");
    expect(
      resolveRange({ range: "custom", from: "2026-05-10", to: "2026-05-01" })
        .key
    ).toBe("7d");
  });

  it("always returns from <= to", () => {
    const r = resolveRange({ range: "30d" });
    expect(r.from.getTime()).toBeLessThanOrEqual(r.to.getTime());
  });
});

describe("eachDayKey / formatDayKey", () => {
  it("produces an inclusive list of day keys", () => {
    const from = new Date(2026, 4, 1);
    const to = new Date(2026, 4, 3);
    expect(eachDayKey(from, to)).toEqual([
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
    ]);
  });

  it("formats a single day as yyyy-mm-dd", () => {
    expect(formatDayKey(new Date(2026, 0, 9))).toBe("2026-01-09");
  });
});
