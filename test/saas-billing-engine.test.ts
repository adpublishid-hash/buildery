import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// Sweep dan persetujuan mengirim email; jalur SMTP tidak relevan di sini.
vi.mock("@/lib/app-email", () => ({
  sendAppEmail: vi.fn(async () => ({ ok: true, provider: "console" as const })),
}));

import { prisma } from "@/lib/prisma";
import {
  approveInvoice,
  createPlanInvoice,
  rejectInvoice,
  scheduleCancellation,
  submitInvoiceProof,
  sweepSaaSBilling,
} from "@/lib/saas-billing";
import { isSubscriptionEntitled } from "@/lib/billing-pricing";

const tag = `billing-${Date.now()}`;
let userId = "";
let otherUserId = "";
let adminId = "";
let starterPlanId = "";
let proPlanId = "";

beforeAll(async () => {
  const [user, other, admin] = await Promise.all([
    prisma.user.create({
      data: { name: tag, email: `${tag}@buildery.test`, role: "OWNER" },
    }),
    prisma.user.create({
      data: { name: `${tag}-b`, email: `${tag}-b@buildery.test`, role: "OWNER" },
    }),
    prisma.user.create({
      data: { name: `${tag}-a`, email: `${tag}-a@buildery.test`, role: "SUPER_ADMIN" },
    }),
  ]);
  userId = user.id;
  otherUserId = other.id;
  adminId = admin.id;

  const starter = await prisma.saaSPlan.findUnique({ where: { tier: "STARTER" } });
  const pro = await prisma.saaSPlan.findUnique({ where: { tier: "PRO" } });
  starterPlanId = starter!.id;
  proPlanId = pro!.id;
});

afterAll(async () => {
  await prisma.saaSInvoice.deleteMany({
    where: { userId: { in: [userId, otherUserId] } },
  });
  await prisma.saaSSubscription.deleteMany({
    where: { userId: { in: [userId, otherUserId] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [userId, otherUserId, adminId] } },
  });
});

describe("createPlanInvoice", () => {
  it("records the amount the customer must transfer", async () => {
    const result = await createPlanInvoice({ userId, planId: proPlanId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const invoice = result.data;
    expect(invoice.number).toMatch(/^INV-PRO-\d{8}-\d{4}$/);
    expect(invoice.promoPrice).toBe(299_000);
    expect(invoice.listPrice).toBe(350_000);
    expect(invoice.totalAmount).toBe(299_000 + invoice.uniqueCode);
    // Kode unik ditahan selama invoice terbuka.
    expect(invoice.openAmountKey).toBe(String(invoice.totalAmount));
  });

  it("reuses the open invoice instead of reissuing a new unique code", async () => {
    // Bug lama: membuka ulang dialog mengubah nominal yang harus ditransfer,
    // sehingga uang yang sudah dikirim tidak pernah cocok lagi.
    const first = await createPlanInvoice({ userId, planId: proPlanId });
    const second = await createPlanInvoice({ userId, planId: proPlanId });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(second.data.id).toBe(first.data.id);
    expect(second.data.totalAmount).toBe(first.data.totalAmount);
  });

  it("never hands two open invoices the same transfer amount", async () => {
    const mine = await createPlanInvoice({ userId, planId: proPlanId });
    const theirs = await createPlanInvoice({ userId: otherUserId, planId: proPlanId });
    expect(mine.ok && theirs.ok).toBe(true);
    if (!mine.ok || !theirs.ok) return;

    expect(theirs.data.totalAmount).not.toBe(mine.data.totalAmount);
  });

  it("closes an open invoice for a different plan", async () => {
    const pro = await createPlanInvoice({ userId, planId: proPlanId });
    const starter = await createPlanInvoice({ userId, planId: starterPlanId });
    expect(pro.ok && starter.ok).toBe(true);
    if (!pro.ok || !starter.ok) return;

    const previous = await prisma.saaSInvoice.findUnique({
      where: { id: pro.data.id },
    });
    expect(previous?.status).toBe("CANCELLED");
    expect(previous?.openAmountKey).toBeNull();
  });

  it("refuses to bill a free plan", async () => {
    const free = await prisma.saaSPlan.findUnique({ where: { tier: "FREE" } });
    const result = await createPlanInvoice({ userId, planId: free!.id });
    expect(result.ok).toBe(false);
  });
});

describe("approveInvoice", () => {
  it("activates the plan and releases the unique code", async () => {
    await prisma.saaSInvoice.deleteMany({ where: { userId } });
    const issued = await createPlanInvoice({ userId, planId: proPlanId });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    await submitInvoiceProof({
      userId,
      invoiceId: issued.data.id,
      proofUrl: "/uploads/billing/test/proof.png",
    });

    const approved = await approveInvoice({
      invoiceId: issued.data.id,
      adminId,
    });
    expect(approved.ok && approved.data.alreadyPaid).toBe(false);

    const invoice = await prisma.saaSInvoice.findUnique({
      where: { id: issued.data.id },
    });
    expect(invoice?.status).toBe("PAID");
    expect(invoice?.proofStatus).toBe("VERIFIED");
    expect(invoice?.openAmountKey).toBeNull();
    expect(invoice?.periodEnd).toBeInstanceOf(Date);

    const subscription = await prisma.saaSSubscription.findUnique({
      where: { userId },
    });
    expect(subscription?.planId).toBe(proPlanId);
    expect(subscription?.status).toBe("ACTIVE");
    expect(isSubscriptionEntitled(subscription!)).toBe(true);
  });

  it("is idempotent, so a double approval does not extend twice", async () => {
    const invoice = await prisma.saaSInvoice.findFirst({
      where: { userId, status: "PAID" },
      orderBy: { createdAt: "desc" },
    });
    const before = await prisma.saaSSubscription.findUnique({ where: { userId } });

    const again = await approveInvoice({ invoiceId: invoice!.id, adminId });
    expect(again.ok && again.data.alreadyPaid).toBe(true);

    const after = await prisma.saaSSubscription.findUnique({ where: { userId } });
    expect(after?.currentPeriodEnd?.getTime()).toBe(
      before?.currentPeriodEnd?.getTime()
    );
  });

  it("stacks a renewal on top of the remaining period", async () => {
    const before = await prisma.saaSSubscription.findUnique({ where: { userId } });
    const renewal = await createPlanInvoice({ userId, planId: proPlanId });
    expect(renewal.ok).toBe(true);
    if (!renewal.ok) return;
    expect(renewal.data.kind).toBe("RENEWAL");

    await approveInvoice({ invoiceId: renewal.data.id, adminId });

    const after = await prisma.saaSSubscription.findUnique({ where: { userId } });
    expect(after!.currentPeriodEnd!.getTime()).toBeGreaterThan(
      before!.currentPeriodEnd!.getTime()
    );
  });
});

describe("rejectInvoice", () => {
  it("closes the invoice and frees its amount", async () => {
    const issued = await createPlanInvoice({ userId: otherUserId, planId: starterPlanId });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    await submitInvoiceProof({
      userId: otherUserId,
      invoiceId: issued.data.id,
      proofUrl: "/uploads/billing/test/wrong.png",
    });
    const rejected = await rejectInvoice({
      invoiceId: issued.data.id,
      adminId,
      reason: "Nominal tidak cocok",
    });
    expect(rejected.ok).toBe(true);

    const invoice = await prisma.saaSInvoice.findUnique({
      where: { id: issued.data.id },
    });
    expect(invoice?.status).toBe("REJECTED");
    expect(invoice?.openAmountKey).toBeNull();
    expect(invoice?.reviewNote).toBe("Nominal tidak cocok");
  });

  it("requires a reason", async () => {
    const issued = await createPlanInvoice({ userId: otherUserId, planId: starterPlanId });
    if (!issued.ok) return;
    const result = await rejectInvoice({
      invoiceId: issued.data.id,
      adminId,
      reason: "   ",
    });
    expect(result.ok).toBe(false);
  });
});

describe("scheduleCancellation", () => {
  it("keeps the paid period the customer already bought", async () => {
    const result = await scheduleCancellation(userId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.effectiveAt).toBeInstanceOf(Date);

    const subscription = await prisma.saaSSubscription.findUnique({
      where: { userId },
    });
    expect(subscription?.cancelAtPeriodEnd).toBe(true);
    expect(subscription?.status).toBe("ACTIVE");
    // Akses tidak boleh dicabut di hari pelanggan menekan batal.
    expect(isSubscriptionEntitled(subscription!)).toBe(true);
  });
});

describe("sweepSaaSBilling", () => {
  it("expires an unpaid invoice and releases its unique code", async () => {
    const issued = await createPlanInvoice({ userId: otherUserId, planId: proPlanId });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    await prisma.saaSInvoice.update({
      where: { id: issued.data.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    await sweepSaaSBilling();

    const invoice = await prisma.saaSInvoice.findUnique({
      where: { id: issued.data.id },
    });
    expect(invoice?.status).toBe("EXPIRED");
    expect(invoice?.openAmountKey).toBeNull();
  });

  it("ends a subscription whose cancellation came due", async () => {
    await prisma.saaSSubscription.update({
      where: { userId },
      data: {
        cancelAtPeriodEnd: true,
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() - 60_000),
      },
    });

    await sweepSaaSBilling();

    const subscription = await prisma.saaSSubscription.findUnique({
      where: { userId },
    });
    expect(subscription?.status).toBe("CANCELLED");
    expect(isSubscriptionEntitled(subscription!)).toBe(false);
  });

  it("moves a lapsed subscription into its grace window, then off the paid plan", async () => {
    await prisma.saaSSubscription.update({
      where: { userId },
      data: {
        planId: proPlanId,
        status: "ACTIVE",
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        currentPeriodEnd: new Date(Date.now() - 60_000),
        graceUntil: null,
        expiredAt: null,
      },
    });

    await sweepSaaSBilling();

    const inGrace = await prisma.saaSSubscription.findUnique({ where: { userId } });
    expect(inGrace?.status).toBe("PAST_DUE");
    expect(inGrace?.graceUntil).toBeInstanceOf(Date);
    // Pembayaran diverifikasi manual, jadi akses tidak mati di detik jatuh tempo.
    expect(isSubscriptionEntitled(inGrace!)).toBe(true);

    // Tagihan perpanjangan dibuat otomatis.
    const renewal = await prisma.saaSInvoice.findFirst({
      where: { userId, status: "AWAITING_PAYMENT" },
      orderBy: { createdAt: "desc" },
    });
    expect(renewal).not.toBeNull();

    await prisma.saaSSubscription.update({
      where: { userId },
      data: { graceUntil: new Date(Date.now() - 60_000) },
    });

    await sweepSaaSBilling();

    const lapsed = await prisma.saaSSubscription.findUnique({ where: { userId } });
    expect(lapsed?.status).toBe("EXPIRED");
    expect(isSubscriptionEntitled(lapsed!)).toBe(false);
  });

  it("sends each renewal reminder stage once", async () => {
    await prisma.saaSSubscription.update({
      where: { userId },
      data: {
        planId: proPlanId,
        status: "ACTIVE",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
        graceUntil: null,
        lastReminderStage: 0,
      },
    });

    await sweepSaaSBilling();
    const first = await prisma.saaSSubscription.findUnique({ where: { userId } });
    expect(first?.lastReminderStage).toBe(7);

    await sweepSaaSBilling();
    const second = await prisma.saaSSubscription.findUnique({ where: { userId } });
    expect(second?.lastReminderStage).toBe(7);
  });
});
