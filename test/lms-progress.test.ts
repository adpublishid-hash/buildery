import { describe, expect, it } from "vitest";

import { deriveEnrollmentProgress } from "@/lib/lms-progress";

describe("deriveEnrollmentProgress", () => {
  it("does not complete an empty course", () => {
    expect(deriveEnrollmentProgress(0, 0)).toEqual({ percent: 0, complete: false });
  });

  it("clamps invalid counts and rounds progress", () => {
    expect(deriveEnrollmentProgress(3, 1)).toEqual({ percent: 33, complete: false });
    expect(deriveEnrollmentProgress(2, 9)).toEqual({ percent: 100, complete: true });
  });
});
