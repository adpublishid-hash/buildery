import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  getFormAvailability,
  parsePublishedFormFields,
  snapshotFormFields,
} from "@/lib/form-publication";
import {
  deleteFormSubmissionUploads,
  PRIVATE_FORM_UPLOAD_ROOT,
} from "@/lib/form-upload";

const field = {
  id: "field_email",
  label: "Email",
  name: "email",
  type: "EMAIL" as const,
  required: true,
  placeholder: "name@example.com",
  helpText: null,
  options: null,
  order: 0,
  pageStep: 0,
  minLength: null,
  maxLength: 160,
  minValue: null,
  maxValue: null,
  pattern: null,
  patternHint: null,
  acceptMime: null,
  visibleIf: null,
};

describe("form publication snapshots", () => {
  it("round-trips the immutable field configuration", () => {
    const snapshot = snapshotFormFields([field]);
    expect(parsePublishedFormFields(snapshot)).toEqual([field]);
  });

  it("drops malformed snapshot entries instead of exposing them publicly", () => {
    expect(
      parsePublishedFormFields([
        { label: "Missing name", type: "TEXT" },
        { ...field, type: "NOT_A_FIELD" },
        field,
      ])
    ).toEqual([field]);
  });
});

describe("form response availability", () => {
  const base = {
    status: "PUBLISHED" as const,
    isOpen: true,
    opensAt: null,
    closesAt: null,
    maxSubmissions: null,
    closedMessage: "Responses are unavailable.",
    submissionCount: 0,
  };

  it("accepts a published form inside its schedule", () => {
    expect(getFormAvailability(base)).toEqual({
      accepting: true,
      reason: null,
      message: null,
    });
  });

  it.each([
    [{ ...base, status: "DRAFT" as const }, "draft"],
    [{ ...base, status: "CLOSED" as const, isOpen: false }, "closed"],
    [
      { ...base, opensAt: new Date("2030-01-02T00:00:00Z") },
      "not_started",
    ],
    [
      { ...base, closesAt: new Date("2029-12-31T00:00:00Z") },
      "ended",
    ],
    [{ ...base, maxSubmissions: 2, submissionCount: 2 }, "full"],
  ])("blocks unavailable forms (%s)", (input, reason) => {
    expect(
      getFormAvailability(input, new Date("2030-01-01T00:00:00Z"))
    ).toMatchObject({
      accepting: false,
      reason,
      message: "Responses are unavailable.",
    });
  });
});

describe("form upload lifecycle", () => {
  it("removes the private submission directory", async () => {
    const submissionId = `test-${randomUUID()}`;
    const directory = path.join(PRIVATE_FORM_UPLOAD_ROOT, submissionId);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "attachment.pdf"), "%PDF-test");

    await expect(deleteFormSubmissionUploads(submissionId)).resolves.toBe(true);
    await expect(stat(directory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses unsafe directory names", async () => {
    await expect(deleteFormSubmissionUploads("../outside")).resolves.toBe(false);
  });
});
