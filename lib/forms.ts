import "server-only";

import type { FormField, FormSubmission } from "@prisma/client";

/** SELECT field options are stored as JSON; this normalises to a list. */
export function parseFieldOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === "string");
}

/** Splits a newline-separated "options" textarea into a clean string[]. */
export function optionsFromText(text: string | undefined | null): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Visibility rules live in `lib/forms-shared.ts` so the storefront form and
 * the field editor — both client components, which cannot import a
 * "server-only" module — evaluate the exact same rules the server enforces
 * on submit. These re-exports keep the server-side import path unchanged.
 */
export {
  evaluateVisible as isFieldVisible,
  parseVisibleIfRule as parseVisibleIf,
} from "@/lib/forms-shared";
export type {
  VisibleIfCondition,
  VisibleIfRule,
} from "@/lib/forms-shared";

/**
 * Reads form submission `data` JSON and returns the cell value as a string
 * for CSV / dashboard rendering.
 */
export function readSubmissionCell(data: unknown, fieldName: string): string {
  if (!data || typeof data !== "object") return "";
  const value = (data as Record<string, unknown>)[fieldName];
  if (value == null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.url === "string") return String(o.url);
    return JSON.stringify(value);
  }
  return String(value);
}

function csvEscape(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** The CSV header line, without a trailing newline. */
export function csvHeaderRow(fields: Pick<FormField, "name" | "label">[]) {
  return ["Submitted at", ...fields.map((f) => f.label)]
    .map(csvEscape)
    .join(",");
}

/** One submission as a CSV line, without a trailing newline. */
export function csvRow(
  fields: Pick<FormField, "name" | "label">[],
  submission: Pick<FormSubmission, "data" | "createdAt">
) {
  return [
    new Date(submission.createdAt).toISOString(),
    ...fields.map((f) => readSubmissionCell(submission.data, f.name)),
  ]
    .map(csvEscape)
    .join(",");
}

/**
 * Renders submissions to a CSV string. The export route streams row by row
 * instead; this stays for callers that genuinely have the whole set in hand.
 */
export function submissionsToCsv(
  fields: Pick<FormField, "name" | "label">[],
  submissions: Pick<FormSubmission, "data" | "createdAt">[]
): string {
  return [
    csvHeaderRow(fields),
    ...submissions.map((submission) => csvRow(fields, submission)),
  ].join("\r\n");
}
