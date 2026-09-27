import "server-only";

import type {
  Prisma,
  SaaSBillingSetting,
  SaaSInvoice,
  SaaSInvoiceKind,
  SaaSPlan,
  SaaSSubscription,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { sendAppEmail } from "@/lib/app-email";
import { reportError } from "@/lib/error-reporting";
import { formatPrice } from "@/lib/utils";
import {
  DEFAULT_GRACE_DAYS,
  DEFAULT_INVOICE_WINDOW_HOURS,
  MAX_UNIQUE_CODE,
  MIN_UNIQUE_CODE,
  addMonths,
  buildInvoiceAmounts,
  dueReminderStage,
  formatInvoiceNumber,
  getMonthlyPlanPricing,
  getProratedCredit,
  isSubscriptionEntitled,
  nextPeriodStart,
  pickUniqueCode,
} from "@/lib/billing-pricing";

export type BillingResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Status invoice yang masih menahan satu nominal transfer. */
export const OPEN_INVOICE_STATUSES = [
  "AWAITING_PAYMENT",
  "AWAITING_VERIFICATION",
] as const;

const SETTINGS_ID = "default";

// ============================================================
// Konfigurasi pembayaran
// ============================================================

export async function getBillingSettings(): Promise<SaaSBillingSetting> {
  const existing = await prisma.saaSBillingSetting.findUnique({
    where: { id: SETTINGS_ID },
  });
  if (existing) return existing;

  // Instalasi baru: buat baris default supaya halaman admin tidak perlu
  // menangani kasus "belum ada konfigurasi" secara terpisah.
  return prisma.saaSBillingSetting.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  });
}

export async function saveBillingSettings(input: {
  qrisImageUrl: string | null;
  qrisMerchantName: string | null;
  whatsappNumber: string | null;
  paymentInstruction: string | null;
  invoiceWindowHours: number;
  graceDays: number;
}): Promise<SaaSBillingSetting> {
  const data = {
    qrisImageUrl: input.qrisImageUrl?.trim() || null,
    qrisMerchantName: input.qrisMerchantName?.trim() || null,
    whatsappNumber: normalizePhone(input.whatsappNumber),
    paymentInstruction: input.paymentInstruction?.trim() || null,
    invoiceWindowHours: clamp(input.invoiceWindowHours, 1, 24 * 14),
    graceDays: clamp(input.graceDays, 0, 30),
  };
  return prisma.saaSBillingSetting.upsert({
    where: { id: SETTINGS_ID },
    update: data,
    create: { id: SETTINGS_ID, ...data },
  });
}

/** Menjadikan 08xx / +62xx sebagai format wa.me (62xx). */
function normalizePhone(value: string | null): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

// ============================================================
// Penerbitan invoice
// ============================================================

export type PlanInvoice = SaaSInvoice & { plan: SaaSPlan };

/**
 * Menerbitkan (atau memakai kembali) tagihan QRIS untuk satu plan berbayar.
 *
 * Invoice terbuka untuk plan yang sama dipakai kembali apa adanya: kalau
 * nomor dan kode uniknya berubah setiap kali dialog dibuka, nominal yang
 * sudah ditransfer pelanggan tidak akan pernah cocok lagi.
 */
export async function createPlanInvoice(input: {
  userId: string;
  planId: string;
  now?: Date;
}): Promise<BillingResult<PlanInvoice>> {
  const now = input.now ?? new Date();

  const plan = await prisma.saaSPlan.findUnique({ where: { id: input.planId } });
  if (!plan || !plan.isPublic) {
    return { ok: false, error: "Plan tidak ditemukan." };
  }
  if (plan.monthlyPrice <= 0) {
    return {
      ok: false,
      error: "Plan ini gratis dan tidak perlu tagihan.",
    };
  }

  const reusable = await prisma.saaSInvoice.findFirst({
    where: {
      userId: input.userId,
      planId: plan.id,
      status: { in: [...OPEN_INVOICE_STATUSES] },
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
    include: { plan: true },
  });
  if (reusable) return { ok: true, data: reusable };

  const settings = await getBillingSettings();
  const subscription = await prisma.saaSSubscription.findUnique({
    where: { userId: input.userId },
    include: { plan: true },
  });

  const pricing = getMonthlyPlanPricing(plan);
  const entitled = subscription
    ? isSubscriptionEntitled(subscription, now)
    : false;

  const isSamePlan = subscription?.planId === plan.id;
  const isUpgrade =
    entitled &&
    !isSamePlan &&
    (subscription?.plan.monthlyPrice ?? 0) > 0 &&
    (subscription?.plan.monthlyPrice ?? 0) < plan.monthlyPrice;

  const kind: SaaSInvoiceKind = isSamePlan
    ? "RENEWAL"
    : isUpgrade
      ? "UPGRADE"
      : "NEW";

  // Potongan hanya untuk upgrade: sisa nilai plan lama yang belum terpakai.
  const proratedCredit = isUpgrade
    ? getProratedCredit({
        currentMonthlyPrice: subscription!.plan.monthlyPrice,
        currentPeriodEnd: subscription!.currentPeriodEnd,
        now,
      })
    : 0;

  const payable = Math.max(0, pricing.payablePrice - proratedCredit);
  const expiresAt = new Date(
    now.getTime() +
      (settings.invoiceWindowHours || DEFAULT_INVOICE_WINDOW_HOURS) *
        60 *
        60 *
        1000
  );

  // Invoice terbuka untuk plan lain harus ditutup: hanya satu yang bisa
  // dibayar, dan membiarkannya berarti menahan nominal transfer sia-sia.
  await closeOtherOpenInvoices(input.userId, plan.id, now);

  for (let attempt = 0; attempt < 6; attempt++) {
    const taken = await prisma.saaSInvoice.findMany({
      where: {
        openAmountKey: { not: null },
        totalAmount: {
          gte: payable + MIN_UNIQUE_CODE,
          lte: payable + MAX_UNIQUE_CODE,
        },
      },
      select: { totalAmount: true },
    });

    const uniqueCode = pickUniqueCode({
      payableAmount: payable,
      takenAmounts: taken.map((row) => row.totalAmount),
    });
    if (uniqueCode == null) {
      return {
        ok: false,
        error:
          "Semua kode pembayaran sedang terpakai. Coba lagi beberapa menit lagi.",
      };
    }

    const amounts = buildInvoiceAmounts({
      listPrice: pricing.listPrice,
      promoPrice: pricing.payablePrice,
      proratedCredit,
      uniqueCode,
    });

    const sequence = await nextInvoiceSequence(now, attempt);
    try {
      const created = await prisma.saaSInvoice.create({
        data: {
          number: formatInvoiceNumber({ tier: plan.tier, sequence, now }),
          userId: input.userId,
          planId: plan.id,
          tier: plan.tier,
          kind,
          status: "AWAITING_PAYMENT",
          listPrice: amounts.listPrice,
          promoPrice: amounts.promoPrice,
          proratedCredit: amounts.proratedCredit,
          uniqueCode: amounts.uniqueCode,
          totalAmount: amounts.totalAmount,
          openAmountKey: String(amounts.totalAmount),
          periodMonths: 1,
          expiresAt,
        },
        include: { plan: true },
      });
      return { ok: true, data: created };
    } catch (error) {
      // Nomor atau nominal keburu diambil permintaan lain: ambil yang lain.
      if (isUniqueViolation(error)) continue;
      reportError("saas invoice create failed", error);
      return { ok: false, error: "Gagal membuat tagihan. Coba lagi." };
    }
  }

  return {
    ok: false,
    error: "Gagal membuat tagihan karena tabrakan nomor. Coba lagi.",
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Urutan invoice berikutnya untuk hari ini.
 *
 * Diambil dari nomor tertinggi yang sudah dipakai, bukan dari jumlah baris:
 * jumlah baris tidak pernah naik lagi setelah ada invoice yang dihapus, dan
 * dua permintaan bersamaan akan menghitung angka yang sama. `attempt`
 * menggeser hasilnya pada percobaan ulang, supaya tabrakan nomor bisa pulih
 * alih-alih mengulang nomor yang sama sampai kehabisan percobaan.
 */
async function nextInvoiceSequence(
  now: Date,
  attempt: number
): Promise<number> {
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const rows = await prisma.saaSInvoice.findMany({
    where: { createdAt: { gte: dayStart } },
    select: { number: true },
  });

  let highest = 0;
  for (const row of rows) {
    const parsed = Number.parseInt(row.number.slice(-4), 10);
    if (Number.isFinite(parsed) && parsed > highest) highest = parsed;
  }
  return highest + 1 + attempt;
}

async function closeOtherOpenInvoices(
  userId: string,
  keepPlanId: string,
  now: Date
) {
  const stale = await prisma.saaSInvoice.findMany({
    where: {
      userId,
      planId: { not: keepPlanId },
      status: { in: [...OPEN_INVOICE_STATUSES] },
    },
    select: { id: true },
  });
  if (stale.length === 0) return;

  // Bukti yang sudah diunggah tidak boleh hilang diam-diam: invoice dengan
  // bukti menunggu verifikasi dibiarkan supaya admin tetap melihatnya.
  await prisma.saaSInvoice.updateMany({
    where: {
      id: { in: stale.map((row) => row.id) },
      status: "AWAITING_PAYMENT",
    },
    data: { status: "CANCELLED", openAmountKey: null, updatedAt: now },
  });
}

/** Membatalkan tagihan yang belum dibayar, atas permintaan pemiliknya. */
export async function cancelOwnInvoice(input: {
  userId: string;
  invoiceId: string;
}): Promise<BillingResult> {
  const closed = await prisma.saaSInvoice.updateMany({
    where: {
      id: input.invoiceId,
      userId: input.userId,
      status: "AWAITING_PAYMENT",
    },
    data: { status: "CANCELLED", openAmountKey: null },
  });
  if (closed.count === 0) {
    return { ok: false, error: "Tagihan sudah tidak bisa dibatalkan." };
  }
  return { ok: true, data: undefined };
}

// ============================================================
// Bukti transfer
// ============================================================

export async function submitInvoiceProof(input: {
  userId: string;
  invoiceId: string;
  proofUrl: string;
  note?: string | null;
  now?: Date;
}): Promise<BillingResult> {
  const now = input.now ?? new Date();
  const invoice = await prisma.saaSInvoice.findFirst({
    where: { id: input.invoiceId, userId: input.userId },
    select: { id: true, status: true, expiresAt: true },
  });
  if (!invoice) return { ok: false, error: "Tagihan tidak ditemukan." };

  if (
    invoice.status !== "AWAITING_PAYMENT" &&
    invoice.status !== "AWAITING_VERIFICATION"
  ) {
    return {
      ok: false,
      error: "Tagihan ini sudah ditutup. Buat tagihan baru dari halaman harga.",
    };
  }

  // Bukti yang masuk setelah lewat tenggat tetap diterima: uangnya sudah
  // dikirim. Yang penting invoice ditarik kembali menjadi menunggu verifikasi.
  await prisma.saaSInvoice.update({
    where: { id: invoice.id },
    data: {
      status: "AWAITING_VERIFICATION",
      proofUrl: input.proofUrl,
      proofNote: input.note?.trim() || null,
      proofStatus: "PENDING",
      proofSubmittedAt: now,
      reviewedAt: null,
      reviewedById: null,
      reviewNote: null,
    },
  });
  return { ok: true, data: undefined };
}

// ============================================================
// Verifikasi admin
// ============================================================

export async function approveInvoice(input: {
  invoiceId: string;
  adminId: string;
  now?: Date;
}): Promise<BillingResult<{ alreadyPaid: boolean }>> {
  const now = input.now ?? new Date();
  const settings = await getBillingSettings();
  const graceDays = settings.graceDays ?? DEFAULT_GRACE_DAYS;

  const outcome = await prisma.$transaction(async (tx) => {
    const invoice = await tx.saaSInvoice.findUnique({
      where: { id: input.invoiceId },
      include: { plan: true, user: { select: { email: true, name: true } } },
    });
    if (!invoice) return { kind: "missing" as const };
    if (invoice.status === "PAID") return { kind: "already" as const };

    // Klaim atomik: dua admin yang menekan setujui bersamaan hanya boleh
    // memperpanjang masa aktif satu kali.
    const claimed = await tx.saaSInvoice.updateMany({
      where: {
        id: invoice.id,
        status: { in: [...OPEN_INVOICE_STATUSES, "EXPIRED", "REJECTED"] },
      },
      data: { status: "PAID" },
    });
    if (claimed.count === 0) return { kind: "already" as const };

    const subscription = await tx.saaSSubscription.findUnique({
      where: { userId: invoice.userId },
    });

    // Perpanjangan plan yang sama menumpuk di atas sisa masa aktif; pindah
    // plan dimulai sekarang, karena potongannya sudah dihitung di invoice.
    const samePlan = subscription?.planId === invoice.planId;
    const periodStart = samePlan
      ? nextPeriodStart(subscription?.currentPeriodEnd ?? null, now)
      : now;
    const periodEnd = addMonths(periodStart, invoice.periodMonths);

    await tx.saaSSubscription.upsert({
      where: { userId: invoice.userId },
      update: {
        planId: invoice.planId,
        status: "ACTIVE",
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        graceUntil: null,
        expiredAt: null,
        lastReminderStage: 0,
      },
      create: {
        userId: invoice.userId,
        planId: invoice.planId,
        status: "ACTIVE",
        startedAt: now,
        currentPeriodEnd: periodEnd,
      },
    });

    await tx.saaSInvoice.update({
      where: { id: invoice.id },
      data: {
        paidAt: now,
        periodStart,
        periodEnd,
        openAmountKey: null,
        proofStatus: "VERIFIED",
        reviewedAt: now,
        reviewedById: input.adminId,
        reviewNote: null,
      },
    });

    // Tagihan lain yang masih terbuka jadi tidak relevan.
    await tx.saaSInvoice.updateMany({
      where: {
        userId: invoice.userId,
        id: { not: invoice.id },
        status: { in: [...OPEN_INVOICE_STATUSES] },
      },
      data: { status: "CANCELLED", openAmountKey: null },
    });

    return {
      kind: "approved" as const,
      invoice,
      periodEnd,
      graceDays,
    };
  });

  if (outcome.kind === "missing") {
    return { ok: false, error: "Tagihan tidak ditemukan." };
  }
  if (outcome.kind === "already") {
    return { ok: true, data: { alreadyPaid: true } };
  }

  await notifyInvoicePaid(outcome.invoice, outcome.periodEnd);
  return { ok: true, data: { alreadyPaid: false } };
}

export async function rejectInvoice(input: {
  invoiceId: string;
  adminId: string;
  reason: string;
  now?: Date;
}): Promise<BillingResult> {
  const now = input.now ?? new Date();
  const reason = input.reason.trim();
  if (!reason) {
    return { ok: false, error: "Alasan penolakan wajib diisi." };
  }

  const invoice = await prisma.saaSInvoice.findUnique({
    where: { id: input.invoiceId },
    include: { plan: true, user: { select: { email: true, name: true } } },
  });
  if (!invoice) return { ok: false, error: "Tagihan tidak ditemukan." };
  if (invoice.status === "PAID") {
    return { ok: false, error: "Tagihan ini sudah lunas." };
  }

  const claimed = await prisma.saaSInvoice.updateMany({
    where: { id: invoice.id, status: { in: [...OPEN_INVOICE_STATUSES] } },
    data: {
      status: "REJECTED",
      proofStatus: "REJECTED",
      openAmountKey: null,
      reviewedAt: now,
      reviewedById: input.adminId,
      reviewNote: reason.slice(0, 500),
    },
  });
  if (claimed.count === 0) {
    return { ok: false, error: "Tagihan sudah tidak menunggu verifikasi." };
  }

  await notifyInvoiceRejected(invoice, reason);
  return { ok: true, data: undefined };
}

// ============================================================
// Pembatalan dan lanjut langganan
// ============================================================

export async function scheduleCancellation(
  userId: string
): Promise<BillingResult<{ effectiveAt: Date | null }>> {
  const subscription = await prisma.saaSSubscription.findUnique({
    where: { userId },
    include: { plan: true },
  });
  if (!subscription) {
    return { ok: false, error: "Belum ada langganan aktif." };
  }
  if (subscription.plan.monthlyPrice <= 0) {
    return { ok: false, error: "Plan gratis tidak perlu dibatalkan." };
  }
  if (subscription.status === "CANCELLED" || subscription.status === "EXPIRED") {
    return { ok: false, error: "Langganan sudah tidak berjalan." };
  }

  const now = new Date();
  const stillPaid =
    subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd.getTime() > now.getTime();

  if (stillPaid) {
    // Masa aktif yang sudah dibayar tetap milik pelanggan.
    await prisma.saaSSubscription.update({
      where: { userId },
      data: { cancelAtPeriodEnd: true, cancelledAt: now },
    });
    return { ok: true, data: { effectiveAt: subscription.currentPeriodEnd } };
  }

  await prisma.saaSSubscription.update({
    where: { userId },
    data: {
      status: "CANCELLED",
      cancelAtPeriodEnd: false,
      cancelledAt: now,
      graceUntil: null,
      expiredAt: now,
    },
  });
  return { ok: true, data: { effectiveAt: null } };
}

export async function resumeSubscription(
  userId: string
): Promise<BillingResult> {
  const updated = await prisma.saaSSubscription.updateMany({
    where: { userId, cancelAtPeriodEnd: true, status: { in: ["ACTIVE", "PAST_DUE"] } },
    data: { cancelAtPeriodEnd: false, cancelledAt: null },
  });
  if (updated.count === 0) {
    return { ok: false, error: "Tidak ada pembatalan terjadwal." };
  }
  return { ok: true, data: undefined };
}

// ============================================================
// Sweep terjadwal
// ============================================================

export type BillingSweepSummary = {
  expiredInvoices: number;
  pastDue: number;
  expiredSubscriptions: number;
  reminded: number;
  renewalInvoices: number;
};

/**
 * Menagih masa aktif yang lewat, melepas kode unik yang kadaluarsa, dan
 * mengingatkan perpanjangan. Pembayaran QRIS diverifikasi manual, jadi tanpa
 * sweep ini tidak ada apa pun yang pernah menutup satu periode.
 */
export async function sweepSaaSBilling(
  now = new Date()
): Promise<BillingSweepSummary> {
  const settings = await getBillingSettings();
  const graceDays = settings.graceDays ?? DEFAULT_GRACE_DAYS;
  const summary: BillingSweepSummary = {
    expiredInvoices: 0,
    pastDue: 0,
    expiredSubscriptions: 0,
    reminded: 0,
    renewalInvoices: 0,
  };

  // 1. Tagihan yang tidak pernah dibayar: tutup dan lepas nominalnya supaya
  //    kode uniknya bisa dipakai pelanggan lain.
  const expired = await prisma.saaSInvoice.updateMany({
    where: { status: "AWAITING_PAYMENT", expiresAt: { lte: now } },
    data: { status: "EXPIRED", openAmountKey: null },
  });
  summary.expiredInvoices = expired.count;

  // 2. Langganan berbayar yang jatuh tempo masuk masa tenggang.
  const due = await prisma.saaSSubscription.findMany({
    where: {
      status: "ACTIVE",
      currentPeriodEnd: { not: null, lte: now },
    },
    include: { plan: true, user: { select: { email: true, name: true } } },
  });

  for (const subscription of due) {
    if (subscription.plan.monthlyPrice <= 0) continue;

    if (subscription.cancelAtPeriodEnd) {
      await prisma.saaSSubscription.update({
        where: { id: subscription.id },
        data: {
          status: "CANCELLED",
          graceUntil: null,
          expiredAt: now,
          lastReminderStage: 0,
        },
      });
      summary.expiredSubscriptions++;
      await notifySubscriptionEnded(subscription, "cancelled");
      continue;
    }

    const graceUntil = new Date(now.getTime() + graceDays * 24 * 60 * 60 * 1000);
    await prisma.saaSSubscription.update({
      where: { id: subscription.id },
      data: { status: "PAST_DUE", graceUntil, lastReminderStage: 0 },
    });
    summary.pastDue++;

    const invoice = await createPlanInvoice({
      userId: subscription.userId,
      planId: subscription.planId,
      now,
    });
    if (invoice.ok) summary.renewalInvoices++;
    await notifyPastDue(subscription, graceUntil, invoice.ok ? invoice.data : null);
  }

  // 3. Masa tenggang habis: turun ke Free.
  const lapsed = await prisma.saaSSubscription.findMany({
    where: {
      status: "PAST_DUE",
      OR: [
        { graceUntil: { not: null, lte: now } },
        { graceUntil: null, currentPeriodEnd: { not: null, lte: now } },
      ],
    },
    include: { plan: true, user: { select: { email: true, name: true } } },
  });

  for (const subscription of lapsed) {
    await prisma.saaSSubscription.update({
      where: { id: subscription.id },
      data: { status: "EXPIRED", graceUntil: null, expiredAt: now },
    });
    summary.expiredSubscriptions++;
    await notifySubscriptionEnded(subscription, "expired");
  }

  // 4. Pengingat perpanjangan H-7 / H-3 / H-1.
  const upcoming = await prisma.saaSSubscription.findMany({
    where: {
      status: "ACTIVE",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: {
        not: null,
        gt: now,
        lte: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000),
      },
    },
    include: { plan: true, user: { select: { email: true, name: true } } },
  });

  for (const subscription of upcoming) {
    if (subscription.plan.monthlyPrice <= 0) continue;
    const stage = dueReminderStage({
      periodEnd: subscription.currentPeriodEnd!,
      lastStage: subscription.lastReminderStage,
      now,
    });
    if (stage == null) continue;

    await prisma.saaSSubscription.update({
      where: { id: subscription.id },
      data: { lastReminderStage: stage },
    });
    summary.reminded++;
    await notifyRenewalReminder(subscription, stage);
  }

  return summary;
}

// ============================================================
// Email
// ============================================================

type SubscriptionWithUser = SaaSSubscription & {
  plan: SaaSPlan;
  user: { email: string; name: string | null };
};

const APP_NAME = "My Landing";

function billingUrl() {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  return `${base}/dashboard/billing`;
}

function formatDateId(value: Date) {
  return value.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

async function safeSend(message: {
  to: string;
  subject: string;
  text: string;
}) {
  try {
    const result = await sendAppEmail(message);
    if (!result.ok) {
      reportError("saas billing email failed", new Error(result.error));
    }
  } catch (error) {
    reportError("saas billing email threw", error);
  }
}

async function notifyInvoicePaid(
  invoice: SaaSInvoice & { plan: SaaSPlan; user: { email: string; name: string | null } },
  periodEnd: Date
) {
  await safeSend({
    to: invoice.user.email,
    subject: `Pembayaran ${invoice.plan.name} diterima · ${APP_NAME}`,
    text: [
      `Halo ${invoice.user.name ?? ""}`.trim() + ",",
      "",
      `Pembayaran untuk invoice ${invoice.number} sudah kami verifikasi.`,
      `Plan ${invoice.plan.name} aktif sampai ${formatDateId(periodEnd)}.`,
      `Total dibayar: ${formatPrice(invoice.totalAmount)}`,
      "",
      `Detail langganan: ${billingUrl()}`,
    ].join("\n"),
  });
}

async function notifyInvoiceRejected(
  invoice: SaaSInvoice & { plan: SaaSPlan; user: { email: string; name: string | null } },
  reason: string
) {
  await safeSend({
    to: invoice.user.email,
    subject: `Bukti pembayaran ${invoice.number} perlu diperbaiki · ${APP_NAME}`,
    text: [
      `Halo ${invoice.user.name ?? ""}`.trim() + ",",
      "",
      `Bukti pembayaran untuk invoice ${invoice.number} (${invoice.plan.name}) belum bisa kami verifikasi.`,
      `Alasan: ${reason}`,
      "",
      `Kamu bisa mengunggah ulang bukti transfer dari halaman billing: ${billingUrl()}`,
    ].join("\n"),
  });
}

async function notifyRenewalReminder(
  subscription: SubscriptionWithUser,
  daysLeft: number
) {
  await safeSend({
    to: subscription.user.email,
    subject: `Plan ${subscription.plan.name} berakhir ${daysLeft} hari lagi · ${APP_NAME}`,
    text: [
      `Halo ${subscription.user.name ?? ""}`.trim() + ",",
      "",
      `Masa aktif plan ${subscription.plan.name} berakhir pada ${formatDateId(subscription.currentPeriodEnd!)}.`,
      "Perpanjang lewat QRIS supaya fitur berbayarmu tidak terputus.",
      "",
      `Perpanjang di sini: ${billingUrl()}`,
    ].join("\n"),
  });
}

async function notifyPastDue(
  subscription: SubscriptionWithUser,
  graceUntil: Date,
  invoice: PlanInvoice | null
) {
  await safeSend({
    to: subscription.user.email,
    subject: `Perpanjangan ${subscription.plan.name} jatuh tempo · ${APP_NAME}`,
    text: [
      `Halo ${subscription.user.name ?? ""}`.trim() + ",",
      "",
      `Masa aktif plan ${subscription.plan.name} sudah berakhir.`,
      `Fitur berbayar masih bisa dipakai sampai ${formatDateId(graceUntil)}.`,
      invoice
        ? `Tagihan perpanjangan ${invoice.number} sudah dibuat. Transfer ${formatPrice(invoice.totalAmount)} tepat sampai digit terakhir.`
        : "",
      "",
      `Bayar di sini: ${billingUrl()}`,
    ]
      .filter(Boolean)
      .join("\n"),
  });
}

async function notifySubscriptionEnded(
  subscription: SubscriptionWithUser,
  reason: "cancelled" | "expired"
) {
  await safeSend({
    to: subscription.user.email,
    subject: `Plan ${subscription.plan.name} sudah berakhir · ${APP_NAME}`,
    text: [
      `Halo ${subscription.user.name ?? ""}`.trim() + ",",
      "",
      reason === "cancelled"
        ? `Pembatalan yang kamu jadwalkan sudah berlaku. Akun kembali ke plan Gratis.`
        : `Masa tenggang sudah habis dan akun kembali ke plan Gratis.`,
      "Data kamu tetap tersimpan; fitur berbayar aktif lagi begitu kamu berlangganan.",
      "",
      `Aktifkan lagi: ${billingUrl()}`,
    ].join("\n"),
  });
}

// ============================================================
// Pembacaan untuk halaman
// ============================================================

export async function getUserInvoices(userId: string, take = 12) {
  return prisma.saaSInvoice.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    include: { plan: { select: { name: true, tier: true } } },
  });
}

export async function getOpenInvoice(
  userId: string,
  now = new Date()
): Promise<PlanInvoice | null> {
  return prisma.saaSInvoice.findFirst({
    where: {
      userId,
      OR: [
        { status: "AWAITING_VERIFICATION" },
        { status: "AWAITING_PAYMENT", expiresAt: { gt: now } },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: { plan: true },
  });
}

export type InvoiceWhereInput = Prisma.SaaSInvoiceWhereInput;
