import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { MAX_TRACKING_ROWS, parseTrackingImport } from "@/lib/tracking-import";

/**
 * Sellers paste whatever the courier's export gave them. What matters is that
 * unusable lines are reported rather than silently dropped — a parcel whose
 * resi never landed is a support ticket a week later.
 */

describe("parseTrackingImport", () => {
  it("reads a plain two-column paste", () => {
    const result = parseTrackingImport("ORD-1,JX123\nORD-2,JX124");
    expect(result.rows).toEqual([
      { orderNumber: "ORD-1", trackingNumber: "JX123", carrier: null },
      { orderNumber: "ORD-2", trackingNumber: "JX124", carrier: null },
    ]);
    expect(result.problems).toEqual([]);
  });

  it("uses a header row when the export has one, in any column order", () => {
    const result = parseTrackingImport(
      ["Resi;Kurir;No Order", "JX999;JNE;ORD-7"].join("\n")
    );
    expect(result.rows).toEqual([
      { orderNumber: "ORD-7", trackingNumber: "JX999", carrier: "JNE" },
    ]);
  });

  it("accepts tabs and semicolons, not just commas", () => {
    expect(parseTrackingImport("ORD-1\tJX1\tJNE").rows[0]).toEqual({
      orderNumber: "ORD-1",
      trackingNumber: "JX1",
      carrier: "JNE",
    });
    expect(parseTrackingImport("ORD-2;JX2").rows[0]?.orderNumber).toBe("ORD-2");
  });

  it("strips the quotes a spreadsheet adds", () => {
    expect(parseTrackingImport('"ORD-1","JX 123"').rows[0]).toMatchObject({
      orderNumber: "ORD-1",
      trackingNumber: "JX 123",
    });
  });

  it("reports a line missing either column instead of dropping it", () => {
    const result = parseTrackingImport("ORD-1,JX1\nORD-2,\n,JX3");
    expect(result.rows).toHaveLength(1);
    expect(result.problems.map((problem) => problem.line)).toEqual([2, 3]);
    expect(result.problems[0].reason).toMatch(/resi/i);
  });

  it("refuses a repeated order number rather than applying the last one", () => {
    const result = parseTrackingImport("ORD-1,JX1\nord-1,JX2");
    expect(result.rows).toHaveLength(1);
    expect(result.problems[0].reason).toMatch(/dua kali/i);
  });

  it("skips blank lines silently", () => {
    expect(parseTrackingImport("\n\nORD-1,JX1\n\n").rows).toHaveLength(1);
  });

  it("stops at the row cap and says so", () => {
    const many = Array.from(
      { length: MAX_TRACKING_ROWS + 5 },
      (_, i) => `ORD-${i},JX${i}`
    ).join("\n");
    const result = parseTrackingImport(many);
    expect(result.rows).toHaveLength(MAX_TRACKING_ROWS);
    expect(result.problems[0].reason).toMatch(new RegExp(String(MAX_TRACKING_ROWS)));
  });

  it("has nothing to do with an empty paste", () => {
    expect(parseTrackingImport("   ")).toEqual({ rows: [], problems: [] });
  });
});
