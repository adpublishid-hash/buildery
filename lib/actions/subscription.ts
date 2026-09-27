"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimitShared } from "@/lib/rate-limit";
import {
  cancelOwnInvoice,
  createPlanInvoice,
  getBillingSettings,
  resumeSubscription,
  scheduleCancellation,
  submitInvoiceProof,
} from "@/lib/saas-billing";
import { isSubscriptionEntitled } from "@/lib/billing-pricing";
import { getDowngradeWarnings } from "@/lib/saas-limits";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/** Yang dikirim ke dialog pembayaran. Semuanya berasal dari server. */
export type CheckoutInvoice = {
  id: string;
  number: string;
  planName: string;
  listPrice: number;
  promoPrice: number;
  proratedCredit: number;
  uniqueCode: number;
  totalAmount: number;
  expiresAt: string;
  status: string;
  proofUrl: string | null;
  qrisImageUrl: string | null;
  qrisMerchantName: string | null;
  whatsappNumber: string | null;
  paymentInstruction: string | null;
  /** Kuota plan tujuan yang sudah dilampaui pemakaian saat ini. */
  warnings: string[];
};

function revalidateBilling() {
  revalidatePath("/dashboard/billing");
  revalidatePath("/pricing");
  revalidatePath("/dashboard", "layout");
}

/**
 * Pindah ke plan gratis.
 *
 * Plan berbayar sengaja ditolak di sini. Ini server action: siapa pun yang
 * sudah login bisa memanggilnya langsung dari browser, jadi satu-satunya
 * jalan menuju plan berbayar adalah invoice yang diverifikasi admin.
 */
export async function subscribeToPlanAction(
  planId: string
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=/pricing`);

  const plan = await prisma.saaSPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isPublic) {
    return { ok: false, error: "Plan tidak ditemukan." };
  }
  if (plan.monthlyPrice > 0) {
    return {
      ok: false,
      error:
        "Plan berbayar hanya aktif setelah pembayaran diverifikasi. Buat tagihan dari halaman harga.",
    };
  }

  const existing = await prisma.saaSSubscription.findUnique({
    where: { userId: session.user.id },
    include: { plan: true },
  });

  // Turun ke Gratis saat plan berbayar masih berlaku berarti membuang masa
  // aktif yang sudah dibayar. Jadwalkan di akhir periode saja.
  if (existing && existing.plan.monthlyPrice > 0 && isSubscriptionEntitled(existing)) {
    const result = await scheduleCancellation(session.user.id);
    if (!result.ok) return result;
    revalidateBilling();
    return { ok: true, data: result.data };
  }

  await prisma.saaSSubscription.upsert({
    where: { userId: session.user.id },
    update: {
      planId: plan.id,
      status: "ACTIVE",
      startedAt: new Date(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      graceUntil: null,
      expiredAt: null,
      lastReminderStage: 0,
    },
    create: {
      userId: session.user.id,
      planId: plan.id,
      status: "ACTIVE",
    },
  });

  revalidateBilling();
  return { ok: true };
}

/**
 * Menerbitkan tagihan QRIS untuk satu plan berbayar dan mengembalikan nomor,
 * kode unik, serta nominal yang tercatat di database — bukan angka yang
 * dikarang ulang di browser setiap kali dialog dibuka.
 */
export async function startPlanCheckoutAction(
  planId: string
): Promise<ActionResult<CheckoutInvoice>> {
  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=/pricing`);

  const limit = await rateLimitShared(
    `saas-checkout:${session.user.id}`,
    10,
    10 * 60 * 1000
  );
  if (!limit.ok) {
    return {
      ok: false,
      error: "Terlalu sering membuat tagihan. Coba lagi beberapa menit lagi.",
    };
  }

  const result = await createPlanInvoice({
    userId: session.user.id,
    planId,
  });
  if (!result.ok) return result;

  const settings = await getBillingSettings();
  const invoice = result.data;
  const warnings = await getDowngradeWarnings(session.user.id, invoice.plan);

  revalidateBilling();
  return {
    ok: true,
    data: {
      id: invoice.id,
      number: invoice.number,
      planName: invoice.plan.name,
      listPrice: invoice.listPrice,
      promoPrice: invoice.promoPrice,
      proratedCredit: invoice.proratedCredit,
      uniqueCode: invoice.uniqueCode,
      totalAmount: invoice.totalAmount,
      expiresAt: invoice.expiresAt.toISOString(),
      status: invoice.status,
      proofUrl: invoice.proofUrl,
      qrisImageUrl: settings.qrisImageUrl,
      qrisMerchantName: settings.qrisMerchantName,
      whatsappNumber: settings.whatsappNumber,
      paymentInstruction: settings.paymentInstruction,
      warnings,
    },
  };
}

export async function submitPaymentProofAction(input: {
  invoiceId: string;
  proofUrl: string;
  note?: string;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard/billing");

  const limit = await rateLimitShared(
    `saas-proof:${session.user.id}`,
    20,
    10 * 60 * 1000
  );
  if (!limit.ok) {
    return { ok: false, error: "Terlalu banyak percobaan. Coba lagi nanti." };
  }

  if (!/^\/uploads\/[\w./-]+$/.test(input.proofUrl)) {
    return { ok: false, error: "Bukti transfer tidak valid." };
  }

  const result = await submitInvoiceProof({
    userId: session.user.id,
    invoiceId: input.invoiceId,
    proofUrl: input.proofUrl,
    note: input.note ?? null,
  });
  if (!result.ok) return result;

  revalidateBilling();
  return { ok: true };
}

export async function cancelInvoiceAction(
  invoiceId: string
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard/billing");

  const result = await cancelOwnInvoice({
    userId: session.user.id,
    invoiceId,
  });
  if (!result.ok) return result;

  revalidateBilling();
  return { ok: true };
}

/**
 * Menjadwalkan pembatalan di akhir periode. Pelanggan sudah membayar sampai
 * tanggal itu, jadi aksesnya tidak dicabut di hari mereka menekan batal.
 */
export async function cancelSubscriptionAction(): Promise<ActionResult<{
  effectiveAt: string | null;
}>> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const result = await scheduleCancellation(session.user.id);
  if (!result.ok) return result;

  revalidateBilling();
  return {
    ok: true,
    data: { effectiveAt: result.data.effectiveAt?.toISOString() ?? null },
  };
}

export async function resumeSubscriptionAction(): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const result = await resumeSubscription(session.user.id);
  if (!result.ok) return result;

  revalidateBilling();
  return { ok: true };
}
