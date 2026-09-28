import { describe, expect, it } from "vitest";

import {
  buildAffiliatePerformance,
  conversionRate,
  countAffiliateStatuses,
  performanceFor,
  summarizeCommissions,
} from "@/lib/affiliate-dashboard";
import {
  AFFILIATE_STATUSES,
  affiliateTransitionVerb,
  canTransitionAffiliate,
  isAffiliateStatus,
} from "@/lib/affiliate-status";
import {
  hasAccessNow,
  isAdminMembershipStatus,
  membershipAccess,
  nextCopySlug,
  planState,
  summarizePlans,
} from "@/lib/membership-dashboard";

const DAY = 86_400_000;

describe("affiliate status transitions", () => {
  it("rejects values that are not affiliate statuses", () => {
    expect(isAffiliateStatus("ACTIVE")).toBe(true);
    expect(isAffiliateStatus("DELETED")).toBe(false);
    expect(isAffiliateStatus(undefined)).toBe(false);
  });

  it("lets pending applications be approved, rejected, or archived", () => {
    expect(canTransitionAffiliate("PENDING", "ACTIVE")).toBe(true);
    expect(canTransitionAffiliate("PENDING", "REJECTED")).toBe(true);
    expect(canTransitionAffiliate("PENDING", "ARCHIVED")).toBe(true);
    expect(canTransitionAffiliate("PENDING", "SUSPENDED")).toBe(false);
  });

  it("does not reject someone who is already active", () => {
    expect(canTransitionAffiliate("ACTIVE", "REJECTED")).toBe(false);
    expect(canTransitionAffiliate("ACTIVE", "SUSPENDED")).toBe(true);
  });

  it("only restores archived affiliates to active", () => {
    expect(canTransitionAffiliate("ARCHIVED", "ACTIVE")).toBe(true);
    expect(canTransitionAffiliate("ARCHIVED", "SUSPENDED")).toBe(false);
    expect(canTransitionAffiliate("ARCHIVED", "PENDING")).toBe(false);
  });

  it("never allows a no-op transition", () => {
    for (const status of AFFILIATE_STATUSES) {
      expect(canTransitionAffiliate(status, status)).toBe(false);
    }
  });

  it("describes the change in words", () => {
    expect(affiliateTransitionVerb("PENDING", "ACTIVE")).toBe("approved");
    expect(affiliateTransitionVerb("ARCHIVED", "ACTIVE")).toBe("restored");
    expect(affiliateTransitionVerb("SUSPENDED", "ACTIVE")).toBe("reactivated");
  });
});

describe("affiliate performance", () => {
  it("combines referrals, unique visitors, and commissions per affiliate", () => {
    const map = buildAffiliatePerformance({
      referrals: [
        { affiliateId: "a", event: "CLICK", _count: { _all: 10 } },
        { affiliateId: "a", event: "LEAD", _count: { _all: 3 } },
        { affiliateId: "a", event: "SALE", _count: { _all: 2 } },
        { affiliateId: "b", event: "CLICK", _count: { _all: 4 } },
      ],
      uniqueVisitors: [
        { affiliateId: "a" },
        { affiliateId: "a" },
        { affiliateId: "a" },
        { affiliateId: "a" },
      ],
      commissions: [
        { affiliateId: "a", status: "PENDING", _sum: { amount: 1000 } },
        { affiliateId: "a", status: "PAID", _sum: { amount: 5000 } },
        { affiliateId: "a", status: "REVERSED", _sum: { amount: 0 } },
        { affiliateId: "a", status: "PAYOUT_SCHEDULED", _sum: { amount: 700 } },
      ],
    });
    const a = performanceFor(map, "a");
    expect(a).toMatchObject({ clicks: 10, uniqueClicks: 4, leads: 3, sales: 2 });
    expect(a.earned).toBe(6700);
    expect(a.paid).toBe(5000);
    expect(a.unpaid).toBe(1700);
    expect(a.conversionRate).toBe(50);

    // Clicks recorded before visitor hashing fall back to the raw count.
    expect(performanceFor(map, "b").uniqueClicks).toBe(4);
    expect(performanceFor(map, "missing")).toMatchObject({ clicks: 0, earned: 0, conversionRate: 0 });
  });

  it("caps conversion and handles zero clicks", () => {
    expect(conversionRate(3, 0)).toBe(0);
    expect(conversionRate(5, 2)).toBe(100);
  });

  it("summarizes the commission ledger by status", () => {
    expect(
      summarizeCommissions([
        { status: "PENDING", _sum: { amount: 100, adjustedAmount: 0 } },
        { status: "APPROVED", _sum: { amount: 200, adjustedAmount: 0 } },
        { status: "PAYOUT_SCHEDULED", _sum: { amount: 300, adjustedAmount: 0 } },
        { status: "PAID", _sum: { amount: 400, adjustedAmount: 50 } },
        { status: "REVERSED", _sum: { amount: 0, adjustedAmount: 90 } },
      ])
    ).toEqual({ total: 1000, pending: 100, approved: 200, scheduled: 300, paid: 400, reversed: 90 });
  });

  it("counts statuses with archived affiliates kept out of All", () => {
    const counts = countAffiliateStatuses([
      { status: "ACTIVE", _count: { _all: 5 } },
      { status: "PENDING", _count: { _all: 2 } },
      { status: "ARCHIVED", _count: { _all: 7 } },
    ]);
    expect(counts.ALL).toBe(7);
    expect(counts.ARCHIVED).toBe(7);
    expect(counts.SUSPENDED).toBe(0);
  });
});

describe("membership plans", () => {
  const base = { level: "BASIC" as const, activeMembers: 0 };

  it("derives plan state with archive taking precedence", () => {
    expect(planState({ isActive: true, archivedAt: null })).toBe("ACTIVE");
    expect(planState({ isActive: false, archivedAt: null })).toBe("INACTIVE");
    expect(planState({ isActive: true, archivedAt: new Date() })).toBe("ARCHIVED");
  });

  it("leaves archived plans out of the headline numbers", () => {
    const summary = summarizePlans([
      { ...base, id: "1", name: "Free", price: 0, isActive: true, archivedAt: null, activeMembers: 12 },
      { ...base, id: "2", name: "Monthly", price: 99_000, isActive: true, archivedAt: null, activeMembers: 30 },
      { ...base, id: "3", name: "Draft", price: 49_000, isActive: false, archivedAt: null },
      { ...base, id: "4", name: "Old", price: 10_000, isActive: false, archivedAt: new Date(), activeMembers: 99 },
    ]);
    expect(summary).toMatchObject({ total: 3, active: 2, archived: 1, paid: 2, cheapestPaid: 49_000, activeMembers: 42 });
    expect(summary.top?.name).toBe("Monthly");
  });

  it("reports no top plan until someone has access", () => {
    const summary = summarizePlans([
      { ...base, id: "1", name: "Monthly", price: 99_000, isActive: true, archivedAt: null },
    ]);
    expect(summary.top).toBeNull();
    expect(summary.cheapestPaid).toBe(99_000);
  });

  it("finds a free copy slug within the 60 character limit", () => {
    expect(nextCopySlug("monthly", [])).toBe("monthly-copy");
    expect(nextCopySlug("monthly", ["monthly-copy", "monthly-copy-2"])).toBe("monthly-copy-3");
    const long = "a".repeat(60);
    const slug = nextCopySlug(long, [`${"a".repeat(55)}-copy`]);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-copy-2")).toBe(true);
  });
});

describe("membership access state", () => {
  const now = Date.parse("2026-09-28T00:00:00.000Z");

  it("treats a missing end date as lifetime", () => {
    expect(membershipAccess({ status: "ACTIVE", expiresAt: null }, now)).toEqual({ kind: "active", daysLeft: null });
  });

  it("flags memberships ending within two weeks", () => {
    expect(membershipAccess({ status: "ACTIVE", expiresAt: new Date(now + 3 * DAY) }, now)).toEqual({
      kind: "expiring",
      daysLeft: 3,
    });
    expect(membershipAccess({ status: "ACTIVE", expiresAt: new Date(now + 40 * DAY) }, now)).toEqual({
      kind: "active",
      daysLeft: 40,
    });
  });

  it("flags active rows whose end date has already passed", () => {
    const lapsed = { status: "ACTIVE" as const, expiresAt: new Date(now - DAY) };
    expect(membershipAccess(lapsed, now)).toEqual({ kind: "lapsed" });
    expect(hasAccessNow(lapsed, now)).toBe(false);
  });

  it("gives no access to cancelled, expired, or pending memberships", () => {
    for (const status of ["CANCELLED", "EXPIRED", "PENDING"] as const) {
      expect(hasAccessNow({ status, expiresAt: null }, now)).toBe(false);
    }
  });

  it("only accepts statuses an admin may set", () => {
    expect(isAdminMembershipStatus("ACTIVE")).toBe(true);
    expect(isAdminMembershipStatus("PENDING")).toBe(false);
    expect(isAdminMembershipStatus("anything")).toBe(false);
  });
});
