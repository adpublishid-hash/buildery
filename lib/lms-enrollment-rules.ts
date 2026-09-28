// Pure rules for admin-side enrollment changes, kept out of the server actions
// so they can be unit-tested.

import type { EnrollmentStatus } from "@prisma/client";

const DAY_MS = 86_400_000;

export type StudentRow = { name: string; email: string };

/**
 * Parses the bulk-enroll textarea: one student per line, either `email` or
 * `Name,email`. Duplicate emails keep the first line; bad lines are returned
 * so the admin can see what was skipped.
 */
export function parseStudentRows(text: string, limit = 500) {
  const rows: StudentRow[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const [first, second] = line.split(",").map((value) => value.trim());
    const email = (second || first).toLowerCase();
    if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email)) {
      invalid.push(line.slice(0, 120));
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    const name = (second ? first : "") || email.split("@")[0];
    rows.push({ name: name.slice(0, 80), email });
    if (rows.length >= limit) break;
  }
  return { rows, invalid };
}

export function accessExpiryFrom(accessDays: number, now = Date.now()) {
  return accessDays > 0 ? new Date(now + accessDays * DAY_MS) : null;
}

/** Later of two expiry dates, where null means lifetime (never ends). */
export function laterExpiry(a: Date | null, b: Date | null) {
  if (!a || !b) return null;
  return a > b ? a : b;
}

export type EnrollDecision =
  | { action: "create"; status: "ACTIVE"; accessExpiresAt: Date | null }
  | { action: "reactivate"; status: "ACTIVE"; accessExpiresAt: Date | null }
  | { action: "extend"; accessExpiresAt: Date | null }
  | { action: "skip" };

/**
 * What adding a student by hand does to their existing enrollment. It never
 * downgrades: a completed student keeps their completion, and access that
 * already runs longer is not shortened.
 */
export function decideManualEnrollment(
  existing: { status: EnrollmentStatus; accessExpiresAt: Date | null } | null,
  accessDays: number,
  now = Date.now()
): EnrollDecision {
  const grant = accessExpiryFrom(accessDays, now);
  if (!existing) return { action: "create", status: "ACTIVE", accessExpiresAt: grant };
  if (existing.status === "CANCELLED" || existing.status === "PENDING") {
    return { action: "reactivate", status: "ACTIVE", accessExpiresAt: grant };
  }
  const lapsed = existing.accessExpiresAt !== null && existing.accessExpiresAt.getTime() <= now;
  const next = lapsed ? grant : laterExpiry(existing.accessExpiresAt, grant);
  const same =
    (next === null && existing.accessExpiresAt === null) ||
    (next !== null && existing.accessExpiresAt !== null && next.getTime() === existing.accessExpiresAt.getTime());
  return same ? { action: "skip" } : { action: "extend", accessExpiresAt: next };
}

/** Statuses that occupy a seat under a course's enrollment limit (matches public enrollment). */
export const SEAT_STATUSES: EnrollmentStatus[] = ["ACTIVE", "COMPLETED"];
