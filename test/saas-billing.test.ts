import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  planFindUnique: vi.fn(),
  subscriptionFindUnique: vi.fn(),
  subscriptionUpsert: vi.fn(),
  subscriptionUpdate: vi.fn(),
}));

const deps = vi.hoisted(() => ({
  auth: vi.fn(),
  createPlanInvoice: vi.fn(),
  scheduleCancellation: vi.fn(),
  resumeSubscription: vi.fn(),
  submitInvoiceProof: vi.fn(),
  cancelOwnInvoice: vi.fn(),
  getBillingSettings: vi.fn(),
  rateLimitShared: vi.fn(),
  getDowngradeWarnings: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/auth", () => ({ auth: deps.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    saaSPlan: { findUnique: db.planFindUnique },
    saaSSubscription: {
      findUnique: db.subscriptionFindUnique,
      upsert: db.subscriptionUpsert,
      update: db.subscriptionUpdate,
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimitShared: deps.rateLimitShared }));
vi.mock("@/lib/saas-limits", () => ({
  getDowngradeWarnings: deps.getDowngradeWarnings,
}));
vi.mock("@/lib/saas-billing", () => ({
  createPlanInvoice: deps.createPlanInvoice,
  scheduleCancellation: deps.scheduleCancellation,
  resumeSubscription: deps.resumeSubscription,
  submitInvoiceProof: deps.submitInvoiceProof,
  cancelOwnInvoice: deps.cancelOwnInvoice,
  getBillingSettings: deps.getBillingSettings,
}));

import {
  startPlanCheckoutAction,
  submitPaymentProofAction,
  subscribeToPlanAction,
} from "@/lib/actions/subscription";

const FREE_PLAN = {
  id: "plan_free",
  tier: "FREE",
  name: "Free",
  monthlyPrice: 0,
  isPublic: true,
};
const PRO_PLAN = {
  id: "plan_pro",
  tier: "PRO",
  name: "Pro",
  monthlyPrice: 299_000,
  isPublic: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  deps.auth.mockResolvedValue({ user: { id: "user_1" } });
  deps.rateLimitShared.mockResolvedValue({ ok: true, retryAfter: 0, remaining: 9 });
  deps.getDowngradeWarnings.mockResolvedValue([]);
  db.subscriptionFindUnique.mockResolvedValue(null);
  db.subscriptionUpsert.mockResolvedValue({});
});

describe("subscribeToPlanAction", () => {
  it("refuses to activate a paid plan without payment", async () => {
    // Ini server action: siapa pun yang login bisa memanggilnya langsung dari
    // browser. Kalau lolos, seluruh plan berbayar jadi gratis.
    db.planFindUnique.mockResolvedValue(PRO_PLAN);

    const result = await subscribeToPlanAction("plan_pro");

    expect(result.ok).toBe(false);
    expect(db.subscriptionUpsert).not.toHaveBeenCalled();
  });

  it("activates a free plan", async () => {
    db.planFindUnique.mockResolvedValue(FREE_PLAN);

    const result = await subscribeToPlanAction("plan_free");

    expect(result.ok).toBe(true);
    expect(db.subscriptionUpsert).toHaveBeenCalledOnce();
    // Plan gratis tidak punya jatuh tempo.
    const call = db.subscriptionUpsert.mock.calls[0][0];
    expect(call.update.currentPeriodEnd).toBeNull();
  });

  it("refuses a plan that is not publicly sold", async () => {
    db.planFindUnique.mockResolvedValue({ ...FREE_PLAN, isPublic: false });
    expect((await subscribeToPlanAction("plan_free")).ok).toBe(false);
  });

  it("schedules cancellation instead of burning a paid period", async () => {
    // Turun ke Gratis saat plan berbayar masih berlaku tidak boleh membuang
    // hari yang sudah dibayar.
    db.planFindUnique.mockResolvedValue(FREE_PLAN);
    db.subscriptionFindUnique.mockResolvedValue({
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      graceUntil: null,
      plan: PRO_PLAN,
    });
    deps.scheduleCancellation.mockResolvedValue({
      ok: true,
      data: { effectiveAt: new Date() },
    });

    const result = await subscribeToPlanAction("plan_free");

    expect(result.ok).toBe(true);
    expect(deps.scheduleCancellation).toHaveBeenCalledWith("user_1");
    expect(db.subscriptionUpsert).not.toHaveBeenCalled();
  });
});

describe("startPlanCheckoutAction", () => {
  it("returns the invoice recorded on the server", async () => {
    deps.createPlanInvoice.mockResolvedValue({
      ok: true,
      data: {
        id: "inv_1",
        number: "INV-PRO-20260918-0001",
        plan: PRO_PLAN,
        listPrice: 350_000,
        promoPrice: 299_000,
        proratedCredit: 0,
        uniqueCode: 421,
        totalAmount: 299_421,
        expiresAt: new Date("2026-09-19T00:00:00Z"),
        status: "AWAITING_PAYMENT",
        proofUrl: null,
      },
    });
    deps.getBillingSettings.mockResolvedValue({
      qrisImageUrl: "/uploads/qris.png",
      qrisMerchantName: "My Landing",
      whatsappNumber: "6289685350650",
      paymentInstruction: null,
    });

    const result = await startPlanCheckoutAction("plan_pro");

    expect(result.ok).toBe(true);
    expect(result.ok && result.data).toMatchObject({
      number: "INV-PRO-20260918-0001",
      uniqueCode: 421,
      totalAmount: 299_421,
      qrisImageUrl: "/uploads/qris.png",
    });
  });

  it("warns when the chosen plan is smaller than current usage", async () => {
    // Downgrade tidak menghapus apa pun, tapi itu harus dikatakan sebelum
    // pelanggan membayar, bukan ditemukan sendiri sesudahnya.
    deps.createPlanInvoice.mockResolvedValue({
      ok: true,
      data: {
        id: "inv_2",
        number: "INV-STARTER-20260918-0002",
        plan: { id: "plan_starter", name: "Starter", tier: "STARTER" },
        listPrice: 120_000,
        promoPrice: 99_000,
        proratedCredit: 0,
        uniqueCode: 210,
        totalAmount: 99_210,
        expiresAt: new Date("2026-09-19T00:00:00Z"),
        status: "AWAITING_PAYMENT",
        proofUrl: null,
      },
    });
    deps.getBillingSettings.mockResolvedValue({
      qrisImageUrl: null,
      qrisMerchantName: null,
      whatsappNumber: null,
      paymentInstruction: null,
    });
    deps.getDowngradeWarnings.mockResolvedValue([
      "workspace: terpakai 3, kuota Starter 1.",
    ]);

    const result = await startPlanCheckoutAction("plan_starter");

    expect(result.ok ? result.data?.warnings : null).toHaveLength(1);
  });

  it("is rate limited per account", async () => {
    deps.rateLimitShared.mockResolvedValue({
      ok: false,
      retryAfter: 60,
      remaining: 0,
    });

    const result = await startPlanCheckoutAction("plan_pro");

    expect(result.ok).toBe(false);
    expect(deps.createPlanInvoice).not.toHaveBeenCalled();
  });
});

describe("submitPaymentProofAction", () => {
  it("rejects a proof URL that does not come from the upload endpoint", async () => {
    const result = await submitPaymentProofAction({
      invoiceId: "inv_1",
      proofUrl: "https://example.com/fake.png",
    });

    expect(result.ok).toBe(false);
    expect(deps.submitInvoiceProof).not.toHaveBeenCalled();
  });

  it("accepts an uploaded proof", async () => {
    deps.submitInvoiceProof.mockResolvedValue({ ok: true, data: undefined });

    const result = await submitPaymentProofAction({
      invoiceId: "inv_1",
      proofUrl: "/uploads/billing/user_1/abc.png",
      note: "BCA 10.00",
    });

    expect(result.ok).toBe(true);
    expect(deps.submitInvoiceProof).toHaveBeenCalledWith({
      userId: "user_1",
      invoiceId: "inv_1",
      proofUrl: "/uploads/billing/user_1/abc.png",
      note: "BCA 10.00",
    });
  });
});
