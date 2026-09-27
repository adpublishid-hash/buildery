import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store-notifications", () => ({
  queueAffiliateEmailNotification: vi.fn(),
}));

import { issueReferralToken, verifyReferralToken } from "@/lib/affiliate";
import { createAffiliateCommission, orderCommissionBasis } from "@/lib/affiliate-commissions";

describe("affiliate attribution tokens", () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = "affiliate-test-secret";
  });

  it("round-trips a signed attribution", () => {
    const token = issueReferralToken({
      workspaceId: "workspace_1",
      affiliateId: "affiliate_1",
      code: "ABC1234",
      clickId: "click_1",
      attributionDays: 30,
    });
    expect(verifyReferralToken(token)).toMatchObject({
      workspaceId: "workspace_1",
      affiliateId: "affiliate_1",
      code: "ABC1234",
      clickId: "click_1",
    });
  });

  it("rejects a payload changed to another workspace", () => {
    const token = issueReferralToken({
      workspaceId: "workspace_1",
      affiliateId: "affiliate_1",
      code: "ABC1234",
    });
    const [encoded, signature] = token.split(".");
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    payload.workspaceId = "workspace_2";
    const forged = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${signature}`;
    expect(verifyReferralToken(forged)).toBeNull();
  });
});

describe("affiliate commission basis", () => {
  const order = {
    subtotal: 200_000,
    discount: 20_000,
    shippingCost: 15_000,
    codFee: 5_000,
    taxAmount: 19_800,
    total: 219_800,
  };

  it("defaults to merchandise after discount", () => {
    expect(orderCommissionBasis(order, {
      includeShipping: false,
      includeTax: false,
      includeFees: false,
    })).toBe(180_000);
  });

  it("only includes configured additions", () => {
    expect(orderCommissionBasis(order, {
      includeShipping: true,
      includeTax: true,
      includeFees: true,
    })).toBe(219_800);
  });
});

describe("affiliate commission isolation", () => {
  it("requires the affiliate and program to belong to the revenue workspace", async () => {
    const tx = {
      affiliate: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const result = await createAffiliateCommission(tx as never, {
      workspaceId: "workspace_1",
      affiliateId: "affiliate_from_workspace_2",
      sourceType: "ORDER",
      sourceId: "order_1",
      sourceLabel: "ORD-1",
      basisAmount: 100_000,
    });
    expect(result).toBeNull();
    expect(tx.affiliate.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "affiliate_from_workspace_2",
        workspaceId: "workspace_1",
        program: { workspaceId: "workspace_1" },
      }),
    }));
  });

  it("rejects a self-referral unless the program explicitly allows it", async () => {
    const tx = {
      affiliate: {
        findFirst: vi.fn().mockResolvedValue({
          id: "affiliate_1",
          customerId: "customer_1",
          customer: { id: "customer_1", email: "buyer@example.com" },
          program: { allowSelfReferral: false },
        }),
      },
      commission: { findUnique: vi.fn(), upsert: vi.fn() },
    };
    const result = await createAffiliateCommission(tx as never, {
      workspaceId: "workspace_1",
      affiliateId: "affiliate_1",
      sourceType: "ORDER",
      sourceId: "order_1",
      sourceLabel: "ORD-1",
      basisAmount: 100_000,
      purchaserCustomerId: "customer_1",
    });
    expect(result).toBeNull();
    expect(tx.commission.upsert).not.toHaveBeenCalled();
  });
});
