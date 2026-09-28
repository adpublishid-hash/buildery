import { describe, expect, it } from "vitest";

import { decideManualEnrollment, laterExpiry, parseStudentRows } from "@/lib/lms-enrollment-rules";

const NOW = Date.parse("2026-09-28T00:00:00.000Z");
const DAY = 86_400_000;

describe("parsing the student list", () => {
  it("accepts emails and Name,email lines, lowercasing and de-duplicating", () => {
    const { rows, invalid } = parseStudentRows("a@x.com\nJane Doe, Jane@X.com\nA@x.com\n\nnot-an-email");
    expect(rows).toEqual([
      { name: "a", email: "a@x.com" },
      { name: "Jane Doe", email: "jane@x.com" },
    ]);
    expect(invalid).toEqual(["not-an-email"]);
  });

  it("stops at the limit", () => {
    const text = Array.from({ length: 10 }, (_, i) => `s${i}@x.com`).join("\n");
    expect(parseStudentRows(text, 3).rows).toHaveLength(3);
  });
});

describe("manual enrollment decisions", () => {
  it("creates a new enrollment with the course's access period", () => {
    const decision = decideManualEnrollment(null, 30, NOW);
    expect(decision).toMatchObject({ action: "create", status: "ACTIVE" });
    expect(decision.action === "create" && decision.accessExpiresAt?.getTime()).toBe(NOW + 30 * DAY);
  });

  it("never downgrades a completed student", () => {
    const decision = decideManualEnrollment({ status: "COMPLETED", accessExpiresAt: null }, 0, NOW);
    expect(decision).toEqual({ action: "skip" });
  });

  it("does not shorten access that already runs longer", () => {
    const existing = { status: "ACTIVE" as const, accessExpiresAt: new Date(NOW + 100 * DAY) };
    expect(decideManualEnrollment(existing, 30, NOW)).toEqual({ action: "skip" });
  });

  it("extends access that ends sooner, or has already lapsed", () => {
    const soon = decideManualEnrollment({ status: "ACTIVE", accessExpiresAt: new Date(NOW + 5 * DAY) }, 30, NOW);
    expect(soon).toEqual({ action: "extend", accessExpiresAt: new Date(NOW + 30 * DAY) });
    const lapsed = decideManualEnrollment({ status: "COMPLETED", accessExpiresAt: new Date(NOW - DAY) }, 30, NOW);
    expect(lapsed).toEqual({ action: "extend", accessExpiresAt: new Date(NOW + 30 * DAY) });
  });

  it("upgrades a time-limited enrollment to lifetime when the course is lifetime", () => {
    const decision = decideManualEnrollment({ status: "ACTIVE", accessExpiresAt: new Date(NOW + 5 * DAY) }, 0, NOW);
    expect(decision).toEqual({ action: "extend", accessExpiresAt: null });
  });

  it("reactivates suspended or unpaid enrollments", () => {
    expect(decideManualEnrollment({ status: "CANCELLED", accessExpiresAt: null }, 0, NOW)).toEqual({
      action: "reactivate",
      status: "ACTIVE",
      accessExpiresAt: null,
    });
    expect(decideManualEnrollment({ status: "PENDING", accessExpiresAt: null }, 0, NOW).action).toBe("reactivate");
  });

  it("treats null as lifetime when comparing expiry dates", () => {
    const d = new Date(NOW);
    expect(laterExpiry(null, d)).toBeNull();
    expect(laterExpiry(d, new Date(NOW + DAY))?.getTime()).toBe(NOW + DAY);
  });
});
