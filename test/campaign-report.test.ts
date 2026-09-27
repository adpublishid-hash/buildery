import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { isPaidMedium, summarizeCampaigns, type CampaignRow } from "@/lib/campaign-report";

const row = (overrides: Partial<CampaignRow>): CampaignRow => ({
  source: "facebook",
  medium: "cpc",
  campaign: "promo",
  visitors: 0,
  views: 0,
  addToCart: 0,
  checkouts: 0,
  purchases: 0,
  revenue: 0,
  refunded: 0,
  ...overrides,
});

describe("campaign report", () => {
  it("recognises paid mediums", () => {
    for (const medium of ["cpc", "CPC", "paid", "paid_social", "cpm", "display"]) {
      expect(isPaidMedium(medium)).toBe(true);
    }
    for (const medium of ["organic", "email", "referral", "(none)"]) {
      expect(isPaidMedium(medium)).toBe(false);
    }
  });

  it("nets refunds out of revenue, overall and for paid traffic", () => {
    const summary = summarizeCampaigns([
      row({ visitors: 100, purchases: 4, revenue: 1_000_000, refunded: 200_000 }),
      row({ source: "(direct)", medium: "(none)", visitors: 50, purchases: 1, revenue: 300_000 }),
    ]);
    expect(summary).toEqual({
      visitors: 150,
      purchases: 5,
      revenue: 1_300_000,
      refunded: 200_000,
      netRevenue: 1_100_000,
      paidRevenue: 800_000,
      paidPurchases: 4,
    });
  });
});
