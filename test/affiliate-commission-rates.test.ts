import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store-notifications", () => ({
  queueAffiliateEmailNotification: vi.fn(),
}));

import { createAffiliateCommission, recurringReferrerForMembership } from "@/lib/affiliate-commissions";

function txFor(affiliate: { commissionPercent: number | null }, programPercent = 20) {
  return {
    affiliate: {
      findFirst: vi.fn().mockResolvedValue({
        id: "affiliate_1",
        customerId: "partner_customer",
        commissionPercent: affiliate.commissionPercent,
        customer: { id: "partner_customer", email: "partner@example.com" },
        program: { allowSelfReferral: false, commissionPercent: programPercent, holdDays: 14 },
      }),
    },
    commission: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation(({ create }) => Promise.resolve({ id: "commission_1", ...create })),
    },
    referral: { upsert: vi.fn().mockResolvedValue({}) },
  };
}

const sale = {
  workspaceId: "workspace_1",
  affiliateId: "affiliate_1",
  sourceType: "ENROLLMENT" as const,
  sourceId: "enrollment_1",
  sourceLabel: "Course",
  basisAmount: 200_000,
  purchaserCustomerId: "buyer",
};

describe("commission rate snapshot", () => {
  it("uses the item rate when the partner has no negotiated rate", async () => {
    const tx = txFor({ commissionPercent: null });
    await createAffiliateCommission(tx as never, { ...sale, itemRateBps: 3500 });
    expect(tx.commission.upsert.mock.calls[0][0].create).toMatchObject({ rateBps: 3500, percent: 35, amount: 70_000 });
  });

  it("uses the partner's negotiated rate over the item rate", async () => {
    const tx = txFor({ commissionPercent: 10 });
    await createAffiliateCommission(tx as never, { ...sale, itemRateBps: 3500 });
    expect(tx.commission.upsert.mock.calls[0][0].create).toMatchObject({ rateBps: 1000, amount: 20_000 });
  });

  it("falls back to the program default", async () => {
    const tx = txFor({ commissionPercent: null }, 25);
    await createAffiliateCommission(tx as never, sale);
    expect(tx.commission.upsert.mock.calls[0][0].create).toMatchObject({ rateBps: 2500, amount: 50_000 });
  });

  it("records nothing when the effective rate is 0%", async () => {
    const tx = txFor({ commissionPercent: null });
    const result = await createAffiliateCommission(tx as never, { ...sale, itemRateBps: 0 });
    expect(result).toBeNull();
    expect(tx.commission.upsert).not.toHaveBeenCalled();
  });
});

describe("recurring membership referrer", () => {
  const input = { workspaceId: "workspace_1", customerMembershipId: "membership_1", excludePaymentId: "renewal_payment" };

  it("returns nothing unless the program pays recurring commissions", async () => {
    const tx = {
      affiliateProgram: { findUnique: vi.fn().mockResolvedValue({ recurringCommissions: false }) },
      payment: { findFirst: vi.fn() },
    };
    expect(await recurringReferrerForMembership(tx as never, input)).toBeNull();
    expect(tx.payment.findFirst).not.toHaveBeenCalled();
  });

  it("finds the partner behind the membership's earliest paid, referred purchase", async () => {
    const tx = {
      affiliateProgram: { findUnique: vi.fn().mockResolvedValue({ recurringCommissions: true }) },
      payment: { findFirst: vi.fn().mockResolvedValue({ referralAffiliateId: "affiliate_1" }) },
    };
    expect(await recurringReferrerForMembership(tx as never, input)).toBe("affiliate_1");
    expect(tx.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "workspace_1",
          customerMembershipId: "membership_1",
          id: { not: "renewal_payment" },
          status: "PAID",
        }),
        orderBy: { createdAt: "asc" },
      })
    );
  });
});
