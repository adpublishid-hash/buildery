"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type AffiliateStatus, type CommissionStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { generateReferralCode } from "@/lib/affiliate";
import {
  consumeAffiliateVerificationCode,
  issueAffiliateVerificationCode,
} from "@/lib/affiliate-verification";
import { encryptPayoutDetails } from "@/lib/affiliate-payout-details";
import { canTransitionAffiliate, isAffiliateStatus } from "@/lib/affiliate-status";
import { UNBATCHED_COMMISSION } from "@/lib/affiliate-overview";
import { getMemberSession } from "@/lib/member-auth";
import { canInWorkspace, type WorkspacePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { rateLimitByIp } from "@/lib/rate-limit";
import { getUserPlan } from "@/lib/saas-limits";
import { getCurrentWorkspace } from "@/lib/workspace";
import { queueAffiliateEmailNotification } from "@/lib/store-notifications";
import { addAffiliateSchema, affiliateProgramSchema } from "@/lib/zod";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function requireAffiliateWorkspace(permission: WorkspacePermission) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, permission)) return null;
  const plan = await getUserPlan(current.workspace.createdById);
  if (!plan.hasAffiliate) return null;
  return { workspace: current.workspace, userId: session.user.id };
}

/** Race-safe creation used only by authenticated dashboard screens. */
export async function ensureAffiliateProgram(workspaceId: string) {
  return prisma.affiliateProgram.upsert({
    where: { workspaceId },
    update: {},
    create: { workspaceId },
  });
}

async function createAffiliateWithUniqueCode(data: {
  programId: string;
  workspaceId: string;
  customerId: string;
  status: AffiliateStatus;
  emailVerifiedAt?: Date;
  termsAcceptedAt?: Date | null;
}) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await prisma.affiliate.create({
        data: { ...data, referralCode: await generateReferralCode() },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    }
  }
  throw new Error("Could not allocate a referral code.");
}

export async function updateAffiliateProgramAction(formData: FormData): Promise<ActionResult> {
  const context = await requireAffiliateWorkspace("affiliate.manage");
  if (!context) return { ok: false, error: "Not allowed." };
  const parsed = affiliateProgramSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    commissionPercent: formData.get("commissionPercent"),
    isOpen: formData.get("isOpen") === "true",
    approvalMode: formData.get("approvalMode"),
    attributionModel: formData.get("attributionModel"),
    attributionDays: formData.get("attributionDays"),
    holdDays: formData.get("holdDays"),
    minimumPayout: formData.get("minimumPayout"),
    allowSelfReferral: formData.get("allowSelfReferral") === "true",
    includeShipping: formData.get("includeShipping") === "true",
    includeTax: formData.get("includeTax") === "true",
    includeFees: formData.get("includeFees") === "true",
    terms: formData.get("terms") || undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the form for errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  await prisma.affiliateProgram.upsert({
    where: { workspaceId: context.workspace.id },
    update: parsed.data,
    create: { workspaceId: context.workspace.id, ...parsed.data },
  });
  revalidatePath("/dashboard/affiliate");
  revalidatePath("/dashboard/affiliate/program");
  revalidatePath(`/site/${context.workspace.slug}/affiliates`);
  return { ok: true };
}

export async function createAffiliateCreativeAction(formData: FormData): Promise<ActionResult> {
  const context = await requireAffiliateWorkspace("affiliate.manage");
  if (!context) return { ok: false, error: "Not allowed." };
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const type = String(formData.get("type") ?? "LINK");
  const targetUrl = String(formData.get("targetUrl") ?? "").trim();
  if (title.length < 2 || title.length > 100 || !content || content.length > 5000) {
    return { ok: false, error: "Add a title and valid content." };
  }
  if (!(type === "LINK" || type === "IMAGE" || type === "COPY")) {
    return { ok: false, error: "Invalid resource type." };
  }
  if ((type === "LINK" || type === "IMAGE") && !/^https?:\/\//i.test(content)) {
    return { ok: false, error: "Link and image resources require an HTTP(S) URL." };
  }
  if (targetUrl && !/^https?:\/\//i.test(targetUrl)) {
    return { ok: false, error: "Target URL must be an HTTP(S) URL." };
  }
  const program = await ensureAffiliateProgram(context.workspace.id);
  await prisma.affiliateCreative.create({
    data: {
      workspaceId: context.workspace.id,
      programId: program.id,
      title,
      type,
      content,
      targetUrl: targetUrl || null,
      sortOrder: Number(formData.get("sortOrder")) || 0,
    },
  });
  revalidatePath("/dashboard/affiliate/program");
  revalidatePath(`/site/${context.workspace.slug}/member/affiliate`);
  return { ok: true };
}

export async function deleteAffiliateCreativeAction(creativeId: string): Promise<ActionResult> {
  const context = await requireAffiliateWorkspace("affiliate.manage");
  if (!context) return { ok: false, error: "Not allowed." };
  const removed = await prisma.affiliateCreative.deleteMany({
    where: { id: creativeId, workspaceId: context.workspace.id },
  });
  if (!removed.count) return { ok: false, error: "Resource not found." };
  revalidatePath("/dashboard/affiliate/program");
  revalidatePath(`/site/${context.workspace.slug}/member/affiliate`);
  return { ok: true };
}

export async function addAffiliateAction(formData: FormData): Promise<ActionResult> {
  const context = await requireAffiliateWorkspace("affiliate.manage");
  if (!context) return { ok: false, error: "Not allowed." };
  const parsed = addAffiliateSchema.safeParse({ name: formData.get("name"), email: formData.get("email") });
  if (!parsed.success) return {
    ok: false,
    error: "Please check the form for errors.",
    fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
  };
  const program = await ensureAffiliateProgram(context.workspace.id);
  const email = parsed.data.email.toLowerCase().trim();
  const customer = await prisma.customer.upsert({
    where: { workspaceId_email: { workspaceId: context.workspace.id, email } },
    update: { name: parsed.data.name.trim() },
    create: { workspaceId: context.workspace.id, name: parsed.data.name.trim(), email },
  });
  const existing = await prisma.affiliate.findUnique({
    where: { programId_customerId: { programId: program.id, customerId: customer.id } },
  });
  if (existing && existing.status !== "ARCHIVED") {
    const state = existing.status === "PENDING" ? "has a pending application" : `is already ${existing.status.toLowerCase()} in the program`;
    return { ok: false, error: `This customer ${state}.`, fieldErrors: { email: [`This customer ${state}.`] } };
  }
  const now = new Date();
  if (existing) {
    await prisma.affiliate.update({
      where: { id: existing.id },
      data: { status: "ACTIVE", approvedAt: now, archivedAt: null, suspendedAt: null },
    });
  } else {
    await createAffiliateWithUniqueCode({
      programId: program.id,
      workspaceId: context.workspace.id,
      customerId: customer.id,
      status: "ACTIVE",
      emailVerifiedAt: now,
    });
  }
  revalidatePath("/dashboard/affiliate");
  return { ok: true };
}

export async function regenerateReferralCodeAction(affiliateId: string): Promise<ActionResult> {
  const context = await requireAffiliateWorkspace("affiliate.manage");
  if (!context) return { ok: false, error: "Not allowed." };
  const affiliate = await prisma.affiliate.findFirst({
    where: { id: affiliateId, workspaceId: context.workspace.id },
    select: { referralCode: true },
  });
  if (!affiliate) return { ok: false, error: "Affiliate not found." };
  const openPayout = await prisma.affiliatePayout.findFirst({
    where: { affiliateId, workspaceId: context.workspace.id, status: { in: ["DRAFT", "PROCESSING"] } },
    select: { id: true },
  });
  if (openPayout) return { ok: false, error: "This affiliate already has an unsettled payout." };
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const code = await generateReferralCode();
      await prisma.$transaction([
        prisma.affiliateCodeAlias.upsert({
          where: { code: affiliate.referralCode },
          update: { expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) },
          create: {
            affiliateId,
            code: affiliate.referralCode,
            expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          },
        }),
        prisma.affiliate.update({ where: { id: affiliateId }, data: { referralCode: code } }),
      ]);
      revalidatePath("/dashboard/affiliate");
      return { ok: true };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    }
  }
  return { ok: false, error: "Could not generate a new code." };
}

/** Historical referrals and commissions remain attached; removal is a soft archive. */
export async function removeAffiliateAction(affiliateId: string): Promise<ActionResult> {
  return setAffiliateStatusAction(affiliateId, "ARCHIVED");
}

type AffiliateContext = NonNullable<Awaited<ReturnType<typeof requireAffiliateWorkspace>>>;

async function applyAffiliateStatus(
  context: AffiliateContext,
  affiliateId: string,
  status: AffiliateStatus,
  reason?: string
): Promise<ActionResult> {
  const affiliate = await prisma.affiliate.findFirst({
    where: { id: affiliateId, workspaceId: context.workspace.id },
    include: { customer: { select: { id: true, email: true } } },
  });
  if (!affiliate) return { ok: false, error: "Affiliate not found." };
  if (!canTransitionAffiliate(affiliate.status, status)) {
    return {
      ok: false,
      error: `A ${affiliate.status.toLowerCase()} affiliate can't be set to ${status.toLowerCase()}.`,
    };
  }
  const now = new Date();
  // Guard against a concurrent change: only update while the status is still
  // the one the transition was validated against.
  const updated = await prisma.affiliate.updateMany({
    where: { id: affiliateId, status: affiliate.status },
    data: {
      status,
      approvedAt: status === "ACTIVE" ? affiliate.approvedAt ?? now : affiliate.approvedAt,
      suspendedAt: status === "SUSPENDED" ? now : null,
      archivedAt: status === "ARCHIVED" ? now : null,
      rejectionReason: status === "REJECTED" ? reason?.slice(0, 500) || "Application rejected" : null,
    },
  });
  if (!updated.count) return { ok: false, error: "The affiliate changed in the meantime. Refresh and try again." };
  if (status === "ACTIVE") {
    await queueAffiliateEmailNotification(prisma, {
      workspaceId: context.workspace.id,
      customerId: affiliate.customer.id,
      recipient: affiliate.customer.email,
      event: "AFFILIATE_APPROVED",
      subject: "Affiliate application approved",
      body: `Your affiliate account is active. Your referral code is ${affiliate.referralCode}.`,
    });
  }
  return { ok: true };
}

export async function setAffiliateStatusAction(
  affiliateId: string,
  status: AffiliateStatus,
  reason?: string
): Promise<ActionResult> {
  const context = await requireAffiliateWorkspace("affiliate.manage");
  if (!context) return { ok: false, error: "Not allowed." };
  if (!isAffiliateStatus(status)) return { ok: false, error: "Invalid affiliate status." };
  const result = await applyAffiliateStatus(context, affiliateId, status, reason);
  revalidatePath("/dashboard/affiliate");
  return result;
}

/** Approves or rejects several pending applications at once. */
export async function bulkSetAffiliateStatusAction(
  affiliateIds: string[],
  status: AffiliateStatus
): Promise<ActionResult<{ updated: number; skipped: number }>> {
  const context = await requireAffiliateWorkspace("affiliate.manage");
  if (!context) return { ok: false, error: "Not allowed." };
  if (!isAffiliateStatus(status)) return { ok: false, error: "Invalid affiliate status." };
  const ids = Array.from(new Set(Array.isArray(affiliateIds) ? affiliateIds : []))
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .slice(0, 100);
  if (!ids.length) return { ok: false, error: "Select at least one affiliate." };
  let updated = 0;
  for (const id of ids) {
    const result = await applyAffiliateStatus(context, id, status);
    if (result.ok) updated += 1;
  }
  revalidatePath("/dashboard/affiliate");
  return { ok: true, data: { updated, skipped: ids.length - updated } };
}

export async function setCommissionStatusAction(
  commissionId: string,
  status: CommissionStatus
): Promise<ActionResult> {
  const context = await requireAffiliateWorkspace("affiliate.manage");
  if (!context) return { ok: false, error: "Not allowed." };
  const commission = await prisma.commission.findFirst({
    where: { id: commissionId, workspaceId: context.workspace.id },
    include: { affiliate: { include: { customer: { select: { id: true, email: true } } } } },
  });
  if (!commission) return { ok: false, error: "Commission not found." };
  if (commission.status !== "PENDING" || status !== "APPROVED") {
    return { ok: false, error: "Commissions only move from pending to approved. Paid status is controlled by payouts." };
  }
  if (commission.availableAt && commission.availableAt > new Date()) {
    return { ok: false, error: "The commission is still in its refund hold period." };
  }
  await prisma.commission.update({ where: { id: commissionId }, data: { status: "APPROVED", approvedAt: new Date() } });
  await queueAffiliateEmailNotification(prisma, {
    workspaceId: context.workspace.id,
    customerId: commission.affiliate.customer.id,
    recipient: commission.affiliate.customer.email,
    event: "COMMISSION_APPROVED",
    subject: "Commission approved",
    body: `Your commission of Rp${commission.amount.toLocaleString("id-ID")} is approved for payout.`,
  });
  revalidatePath("/dashboard/affiliate/commissions");
  return { ok: true };
}

export async function approveMatureCommissionsAction(): Promise<ActionResult<{ count: number }>> {
  const context = await requireAffiliateWorkspace("affiliate.manage");
  if (!context) return { ok: false, error: "Not allowed." };
  const eligible = await prisma.commission.findMany({
    where: {
      workspaceId: context.workspace.id,
      status: "PENDING",
      OR: [{ availableAt: null }, { availableAt: { lte: new Date() } }],
    },
    include: { affiliate: { include: { customer: { select: { id: true, email: true } } } } },
    take: 500,
  });
  let count = 0;
  for (const commission of eligible) {
    const changed = await prisma.commission.updateMany({
      where: { id: commission.id, status: "PENDING" },
      data: { status: "APPROVED", approvedAt: new Date() },
    });
    if (!changed.count) continue;
    count += 1;
    await queueAffiliateEmailNotification(prisma, {
      workspaceId: context.workspace.id,
      customerId: commission.affiliate.customer.id,
      recipient: commission.affiliate.customer.email,
      event: "COMMISSION_APPROVED",
      subject: "Commission approved",
      body: `Your commission of Rp${commission.amount.toLocaleString("id-ID")} is approved for payout.`,
    });
  }
  revalidatePath("/dashboard/affiliate/commissions");
  return { ok: true, data: { count } };
}

export async function createAffiliatePayoutAction(affiliateId: string): Promise<ActionResult<{ payoutId: string }>> {
  const context = await requireAffiliateWorkspace("affiliate.payout");
  if (!context) return { ok: false, error: "Not allowed." };
  const affiliate = await prisma.affiliate.findFirst({
    where: { id: affiliateId, workspaceId: context.workspace.id },
    include: { program: { select: { minimumPayout: true } } },
  });
  if (!affiliate) return { ok: false, error: "Affiliate not found." };
  if (affiliate.status !== "ACTIVE" && affiliate.status !== "SUSPENDED") {
    return { ok: false, error: `This affiliate is ${affiliate.status.toLowerCase()}. Only active or suspended affiliates can be paid out.` };
  }
  const commissions = await prisma.commission.findMany({
    where: { affiliateId, workspaceId: context.workspace.id, ...UNBATCHED_COMMISSION },
    orderBy: { createdAt: "asc" },
  });
  const adjustments = await prisma.commissionAdjustment.findMany({
    where: {
      workspaceId: context.workspace.id,
      recoveredAt: null,
      commission: { affiliateId, status: "PAID" },
    },
    orderBy: { createdAt: "asc" },
  });
  const grossAmount = commissions.reduce((total, item) => total + item.amount, 0);
  const outstandingAdjustments = adjustments.reduce(
    (total, item) => total + Math.max(0, item.amount - item.recoveredAmount),
    0
  );
  const adjustmentAmount = Math.min(grossAmount, outstandingAdjustments);
  const amount = grossAmount - adjustmentAmount;
  if (!commissions.length || amount < affiliate.program.minimumPayout) {
    return { ok: false, error: `Approved balance has not reached the minimum payout of Rp${affiliate.program.minimumPayout.toLocaleString("id-ID")}.` };
  }
  const payout = await prisma.$transaction(async (tx) => {
    // Items left by a failed or cancelled batch block re-batching (one item
    // per commission); that batch keeps its amount, reference, and notes.
    await tx.affiliatePayoutItem.deleteMany({
      where: {
        commissionId: { in: commissions.map((item) => item.id) },
        payout: { status: { in: ["FAILED", "CANCELLED"] } },
      },
    });
    const created = await tx.affiliatePayout.create({
      data: {
        workspaceId: context.workspace.id,
        affiliateId,
        amount,
        grossAmount,
        adjustmentAmount,
        method: affiliate.payoutMethod,
        accountLabel: affiliate.payoutAccountLabel,
        accountDetailsEncrypted: affiliate.payoutDetailsEncrypted,
        idempotencyKey: `${context.workspace.id}:${affiliateId}:${randomUUID()}`,
        createdById: context.userId,
        items: { create: commissions.map((item) => ({ commissionId: item.id, amount: item.amount })) },
      },
    });
    await tx.commission.updateMany({
      where: { id: { in: commissions.map((item) => item.id) }, status: "APPROVED" },
      data: { status: "PAYOUT_SCHEDULED" },
    });
    return created;
  });
  revalidatePath("/dashboard/affiliate/commissions");
  revalidatePath("/dashboard/affiliate/payouts");
  return { ok: true, data: { payoutId: payout.id } };
}

export async function updateAffiliatePayoutAction(payoutId: string, formData: FormData): Promise<ActionResult> {
  const context = await requireAffiliateWorkspace("affiliate.payout");
  if (!context) return { ok: false, error: "Not allowed." };
  const payout = await prisma.affiliatePayout.findFirst({
    where: { id: payoutId, workspaceId: context.workspace.id },
    include: {
      items: { select: { commissionId: true } },
      affiliate: { include: { customer: { select: { id: true, email: true } } } },
    },
  });
  if (!payout) return { ok: false, error: "Payout not found." };
  const status = String(formData.get("status"));
  if (!(["PROCESSING", "PAID", "FAILED", "CANCELLED"] as const).includes(status as never)) {
    return { ok: false, error: "Invalid payout status." };
  }
  // FAILED is final too: its commissions were released back to the approved
  // balance, so settling it later would pay money the ledger doesn't track.
  if (payout.status === "PAID" || payout.status === "CANCELLED" || payout.status === "FAILED") {
    return { ok: false, error: "This payout is final and cannot be changed. Create a new payout instead." };
  }
  const reference = String(formData.get("reference") ?? "").trim().slice(0, 200);
  if (status === "PAID" && !reference) return { ok: false, error: "Payment reference is required." };
  await prisma.$transaction(async (tx) => {
    await tx.affiliatePayout.update({
      where: { id: payoutId },
      data: {
        status: status as "PROCESSING" | "PAID" | "FAILED" | "CANCELLED",
        reference: reference || payout.reference,
        proofUrl: String(formData.get("proofUrl") ?? "").trim().slice(0, 2000) || payout.proofUrl,
        note: String(formData.get("note") ?? "").trim().slice(0, 2000) || payout.note,
        processedAt: status === "PROCESSING" || status === "PAID" ? new Date() : payout.processedAt,
        paidAt: status === "PAID" ? new Date() : null,
        failureReason: status === "FAILED" ? String(formData.get("note") ?? "").slice(0, 2000) : null,
      },
    });
    await tx.commission.updateMany({
      where: {
        id: { in: payout.items.map((item) => item.commissionId) },
        status: "PAYOUT_SCHEDULED",
      },
      data: status === "PAID"
        ? { status: "PAID", paidAt: new Date() }
        : status === "FAILED" || status === "CANCELLED"
          ? { status: "APPROVED", paidAt: null }
          : { status: "PAYOUT_SCHEDULED" },
    });
    if (status === "PAID") {
      const adjustments = await tx.commissionAdjustment.findMany({
        where: {
          workspaceId: context.workspace.id,
          recoveredAt: null,
          commission: { affiliateId: payout.affiliateId, status: "PAID" },
        },
        orderBy: { createdAt: "asc" },
      });
      let remaining = payout.adjustmentAmount;
      for (const adjustment of adjustments) {
        if (remaining <= 0) break;
        const outstanding = Math.max(0, adjustment.amount - adjustment.recoveredAmount);
        const recovered = Math.min(outstanding, remaining);
        const nextRecovered = adjustment.recoveredAmount + recovered;
        await tx.commissionAdjustment.update({
          where: { id: adjustment.id },
          data: {
            recoveredAmount: nextRecovered,
            recoveredAt: nextRecovered >= adjustment.amount ? new Date() : null,
            recoveredPayoutId: payout.id,
          },
        });
        remaining -= recovered;
      }
      await queueAffiliateEmailNotification(tx, {
        workspaceId: context.workspace.id,
        customerId: payout.affiliate.customer.id,
        recipient: payout.affiliate.customer.email,
        event: "PAYOUT_PAID",
        subject: "Affiliate payout paid",
        body: `Your payout of Rp${payout.amount.toLocaleString("id-ID")} has been paid. Reference: ${reference}.`,
      });
    }
  });
  revalidatePath("/dashboard/affiliate/commissions");
  revalidatePath("/dashboard/affiliate/payouts");
  return { ok: true };
}

export async function updateMyAffiliatePayoutDetailsAction(
  workspaceSlug: string,
  formData: FormData
): Promise<ActionResult> {
  const member = await getMemberSession(workspaceSlug);
  if (!member) return { ok: false, error: "Please log in first." };
  const method = String(formData.get("method"));
  if (!(["BANK_TRANSFER", "EWALLET", "OTHER"] as const).includes(method as never)) {
    return { ok: false, error: "Invalid payout method." };
  }
  const accountLabel = String(formData.get("accountLabel") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim();
  if (accountLabel.length < 3 || details.length < 3) return { ok: false, error: "Complete the payout account details." };
  const updated = await prisma.affiliate.updateMany({
    where: { workspaceId: member.workspaceId, customerId: member.customerId, status: { not: "ARCHIVED" } },
    data: {
      payoutMethod: method as "BANK_TRANSFER" | "EWALLET" | "OTHER",
      payoutAccountLabel: accountLabel.slice(0, 120),
      payoutDetailsEncrypted: encryptPayoutDetails(details.slice(0, 1000)),
    },
  });
  if (!updated.count) return { ok: false, error: "Affiliate account not found." };
  revalidatePath(`/site/${workspaceSlug}/affiliate-dashboard`);
  return { ok: true };
}

export async function joinAffiliateProgramAction(
  workspaceSlug: string,
  formData: FormData
): Promise<ActionResult<{
  verificationRequired?: boolean;
  devCode?: string;
  status?: AffiliateStatus;
  referralCode?: string;
  referralUrl?: string;
  existing?: boolean;
}>> {
  const limit = await rateLimitByIp(`affiliate-join:${workspaceSlug}`, 8, 15 * 60 * 1000);
  if (!limit.ok) return { ok: false, error: "Terlalu banyak percobaan. Coba lagi beberapa saat lagi." };
  const parsed = addAffiliateSchema.safeParse({ name: formData.get("name"), email: formData.get("email") });
  if (!parsed.success) return {
    ok: false,
    error: "Periksa lagi data affiliate.",
    fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
  };
  const workspace = await prisma.workspace.findFirst({
    where: { slug: workspaceSlug, status: "ACTIVE" },
    select: { id: true, slug: true, name: true, createdById: true, affiliateProgram: true },
  });
  if (!workspace || !(await getUserPlan(workspace.createdById)).hasAffiliate) {
    return { ok: false, error: "Program affiliate tidak tersedia." };
  }
  const program = workspace.affiliateProgram;
  if (!program?.isOpen) return { ok: false, error: "Program affiliate sedang ditutup sementara." };
  if (program.terms && formData.get("acceptTerms") !== "true") {
    return { ok: false, error: "Setujui ketentuan program untuk melanjutkan." };
  }
  const email = parsed.data.email.toLowerCase().trim();
  const code = String(formData.get("verificationCode") ?? "").trim();
  if (!code) {
    try {
      const devCode = await issueAffiliateVerificationCode(workspace.id, workspace.name, email);
      return { ok: true, data: { verificationRequired: true, devCode } };
    } catch {
      return { ok: false, error: "Kode verifikasi belum dapat dikirim. Coba lagi." };
    }
  }
  const verified = await consumeAffiliateVerificationCode(workspace.id, email, code);
  if (!verified.ok) return { ok: false, error: verified.error, fieldErrors: { verificationCode: [verified.error] } };

  const now = new Date();
  const customer = await prisma.customer.upsert({
    where: { workspaceId_email: { workspaceId: workspace.id, email } },
    update: { name: parsed.data.name.trim() },
    create: { workspaceId: workspace.id, name: parsed.data.name.trim(), email },
  });
  const existing = await prisma.affiliate.findUnique({
    where: { programId_customerId: { programId: program.id, customerId: customer.id } },
  });
  const status: AffiliateStatus = program.approvalMode === "AUTO" ? "ACTIVE" : "PENDING";
  const affiliate = existing
    ? await prisma.affiliate.update({
        where: { id: existing.id },
        data: {
          emailVerifiedAt: now,
          termsAcceptedAt: formData.get("acceptTerms") === "true" ? now : existing.termsAcceptedAt,
          ...(existing.status === "ARCHIVED" || existing.status === "REJECTED"
            ? { status, archivedAt: null, rejectionReason: null, approvedAt: status === "ACTIVE" ? now : null }
            : {}),
        },
      })
    : await createAffiliateWithUniqueCode({
        programId: program.id,
        workspaceId: workspace.id,
        customerId: customer.id,
        status,
        emailVerifiedAt: now,
        termsAcceptedAt: formData.get("acceptTerms") === "true" ? now : null,
      });
  revalidatePath("/dashboard/affiliate");
  revalidatePath(`/site/${workspace.slug}/affiliates`);
  const active = affiliate.status === "ACTIVE";
  await queueAffiliateEmailNotification(prisma, {
    workspaceId: workspace.id,
    customerId: customer.id,
    recipient: customer.email,
    event: active ? "AFFILIATE_APPROVED" : "AFFILIATE_APPLICATION_RECEIVED",
    subject: active ? "Affiliate account active" : "Affiliate application received",
    body: active
      ? `Your affiliate account is active. Your referral code is ${affiliate.referralCode}.`
      : "Your application has been received and is waiting for review.",
  });
  return {
    ok: true,
    data: {
      status: affiliate.status,
      existing: Boolean(existing),
      ...(active ? {
        referralCode: affiliate.referralCode,
        referralUrl: `${getAppBaseUrl()}/r/${affiliate.referralCode}`,
      } : {}),
    },
  };
}

function getAppBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
}
