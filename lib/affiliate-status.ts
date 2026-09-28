// Pure affiliate status rules, safe to import from server and client code.

import type { AffiliateStatus } from "@prisma/client";

export const AFFILIATE_STATUSES: AffiliateStatus[] = [
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "REJECTED",
  "ARCHIVED",
];

export const AFFILIATE_STATUS_LABEL: Record<AffiliateStatus, string> = {
  PENDING: "Pending review",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  REJECTED: "Rejected",
  ARCHIVED: "Archived",
};

/**
 * Which statuses an administrator may move an affiliate to from each state.
 * Archived affiliates can only be restored to active; everything else can be
 * archived so history stays attached instead of being deleted.
 */
const TRANSITIONS: Record<AffiliateStatus, AffiliateStatus[]> = {
  PENDING: ["ACTIVE", "REJECTED", "ARCHIVED"],
  ACTIVE: ["SUSPENDED", "ARCHIVED"],
  SUSPENDED: ["ACTIVE", "ARCHIVED"],
  REJECTED: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: ["ACTIVE"],
};

export function isAffiliateStatus(value: unknown): value is AffiliateStatus {
  return typeof value === "string" && (AFFILIATE_STATUSES as string[]).includes(value);
}

export function allowedAffiliateTransitions(from: AffiliateStatus): AffiliateStatus[] {
  return TRANSITIONS[from];
}

export function canTransitionAffiliate(from: AffiliateStatus, to: AffiliateStatus) {
  return TRANSITIONS[from].includes(to);
}

/** Toast-friendly past tense for a status change. */
export function affiliateTransitionVerb(from: AffiliateStatus, to: AffiliateStatus) {
  if (to === "ACTIVE") {
    if (from === "PENDING" || from === "REJECTED") return "approved";
    if (from === "ARCHIVED") return "restored";
    return "reactivated";
  }
  if (to === "SUSPENDED") return "suspended";
  if (to === "REJECTED") return "rejected";
  if (to === "ARCHIVED") return "archived";
  return "updated";
}
