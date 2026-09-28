// Pure membership dashboard helpers, safe to import from server and client code.

import type { MembershipLevel, MembershipStatus } from "@prisma/client";

const DAY_MS = 86_400_000;

export type PlanState = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export function planState(plan: { isActive: boolean; archivedAt: Date | null }): PlanState {
  if (plan.archivedAt) return "ARCHIVED";
  return plan.isActive ? "ACTIVE" : "INACTIVE";
}

export function isPlanState(value: unknown): value is PlanState {
  return value === "ACTIVE" || value === "INACTIVE" || value === "ARCHIVED";
}

export type PlanSummaryInput = {
  id: string;
  name: string;
  level: MembershipLevel;
  price: number;
  isActive: boolean;
  archivedAt: Date | null;
  activeMembers: number;
};

/** Headline numbers for the plans page. Archived plans never count. */
export function summarizePlans<T extends PlanSummaryInput>(plans: T[]) {
  const live = plans.filter((plan) => !plan.archivedAt);
  const active = live.filter((plan) => plan.isActive);
  const paid = live.filter((plan) => plan.price > 0);
  const top = live
    .filter((plan) => plan.activeMembers > 0)
    .sort((a, b) => b.activeMembers - a.activeMembers)[0] ?? null;
  return {
    total: live.length,
    active: active.length,
    archived: plans.length - live.length,
    paid: paid.length,
    cheapestPaid: paid.length ? Math.min(...paid.map((plan) => plan.price)) : null,
    activeMembers: live.reduce((sum, plan) => sum + plan.activeMembers, 0),
    top,
  };
}

/** Statuses an administrator can set directly from the members table. */
export const ADMIN_MEMBERSHIP_STATUSES: MembershipStatus[] = ["ACTIVE", "CANCELLED", "EXPIRED"];

export function isAdminMembershipStatus(value: unknown): value is MembershipStatus {
  return typeof value === "string" && (ADMIN_MEMBERSHIP_STATUSES as string[]).includes(value);
}

export type AccessState =
  | { kind: "active"; daysLeft: number | null }
  | { kind: "expiring"; daysLeft: number }
  | { kind: "lapsed" }
  | { kind: "pending" }
  | { kind: "cancelled" }
  | { kind: "expired" };

/**
 * What a member can actually do right now. "lapsed" flags rows still marked
 * ACTIVE whose end date has passed and the lifecycle sweep hasn't run yet.
 */
export function membershipAccess(
  membership: { status: MembershipStatus; expiresAt: Date | null },
  now: number,
  expiringWithinDays = 14
): AccessState {
  if (membership.status === "PENDING") return { kind: "pending" };
  if (membership.status === "CANCELLED") return { kind: "cancelled" };
  if (membership.status === "EXPIRED") return { kind: "expired" };
  if (!membership.expiresAt) return { kind: "active", daysLeft: null };
  const remaining = membership.expiresAt.getTime() - now;
  if (remaining <= 0) return { kind: "lapsed" };
  const daysLeft = Math.ceil(remaining / DAY_MS);
  if (daysLeft <= expiringWithinDays) return { kind: "expiring", daysLeft };
  return { kind: "active", daysLeft };
}

export function hasAccessNow(membership: { status: MembershipStatus; expiresAt: Date | null }, now: number) {
  const state = membershipAccess(membership, now);
  return state.kind === "active" || state.kind === "expiring";
}

const SLUG_MAX = 60;

/** First free "<base>-copy", "<base>-copy-2", … slug not in `taken`, within the 60-char limit. */
export function nextCopySlug(base: string, taken: Iterable<string>) {
  const used = new Set(taken);
  const withSuffix = (suffix: string) =>
    `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, "")}${suffix}`;
  for (let n = 1; n < 1000; n++) {
    const candidate = withSuffix(n === 1 ? "-copy" : `-copy-${n}`);
    if (!used.has(candidate)) return candidate;
  }
  return withSuffix(`-${Date.now().toString(36)}`);
}
