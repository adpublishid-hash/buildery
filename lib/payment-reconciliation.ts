import "server-only";

import type {
  PaymentReconciliationResult,
  PaymentStatus,
  Prisma,
} from "@prisma/client";

import {
  fetchMidtransTransactionStatus,
  isMidtransConfigured,
  mapMidtransStatus,
  MidtransApiError,
  type MidtransTransactionStatus,
} from "@/lib/midtrans";
import { applyPaymentStatus } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { getWorkspaceMidtransConfig } from "@/lib/ecommerce-settings";
import { reportError } from "@/lib/error-reporting";

const DEFAULT_RECONCILIATION_MIN_AGE_MINUTES = 2;

const pendingPaymentSelect = {
  id: true,
  workspaceId: true,
  status: true,
  midtransOrderId: true,
} as const;

type PendingPayment = Prisma.PaymentGetPayload<{
  select: typeof pendingPaymentSelect;
}>;

export type PaymentReconciliationSummary = {
  scanned: number;
  synced: number;
  unchanged: number;
  notFound: number;
  failed: number;
  skipped: number;
  unconfigured: boolean;
};

export async function reconcilePendingMidtransPayments(
  options: { limit?: number; now?: Date; minAgeMinutes?: number } = {}
): Promise<PaymentReconciliationSummary> {
  const summary: PaymentReconciliationSummary = {
    scanned: 0,
    synced: 0,
    unchanged: 0,
    notFound: 0,
    failed: 0,
    skipped: 0,
    unconfigured: false,
  };

  const now = options.now ?? new Date();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const minAgeMinutes =
    options.minAgeMinutes ?? DEFAULT_RECONCILIATION_MIN_AGE_MINUTES;
  const createdBefore = addMinutes(now, -minAgeMinutes);
  const payments = await prisma.payment.findMany({
    where: {
      status: "PENDING",
      provider: "midtrans",
      createdAt: { lte: createdBefore },
      OR: [
        { snapToken: { not: null } },
        { snapRedirectUrl: { not: null } },
        { transactionId: { not: null } },
        { transactionStatus: { not: null } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: pendingPaymentSelect,
  });

  summary.scanned = payments.length;

  for (const payment of payments) {
    const outcome = await reconcileOnePayment(payment, now);
    if (outcome === "UNCONFIGURED") {
      summary.unconfigured = true;
      summary.skipped += 1;
      continue;
    }
    if (outcome === "SYNCED") summary.synced += 1;
    else if (outcome === "UNCHANGED") summary.unchanged += 1;
    else if (outcome === "NOT_FOUND") summary.notFound += 1;
    else summary.failed += 1;
  }

  return summary;
}

/**
 * Reconciles a single payment on demand — the Payment Audit screen's
 * "sync sekarang" button, which cannot wait up to five minutes for the next
 * sweep. `workspaceId` is required so a dashboard action can never reach
 * another tenant's payment.
 */
export async function reconcileMidtransPayment(
  paymentId: string,
  input: { workspaceId: string; now?: Date }
): Promise<
  | { ok: true; result: Exclude<PaymentReconciliationResult, "FAILED"> }
  | { ok: false; error: string }
> {
  const payment = await prisma.payment.findFirst({
    where: {
      id: paymentId,
      workspaceId: input.workspaceId,
      provider: "midtrans",
    },
    select: pendingPaymentSelect,
  });
  if (!payment) return { ok: false, error: "Payment tidak ditemukan." };
  // A settled payment has nothing left to learn from Midtrans, and
  // applyPaymentStatus would ignore the answer anyway.
  if (payment.status !== "PENDING") {
    return { ok: false, error: "Payment ini sudah final." };
  }

  const result = await reconcileOnePayment(payment, input.now ?? new Date());
  if (result === "UNCONFIGURED") {
    return { ok: false, error: "Midtrans belum dikonfigurasi." };
  }
  if (result === "FAILED") {
    return { ok: false, error: "Sync ke Midtrans gagal. Coba lagi." };
  }
  return { ok: true, result };
}

/**
 * One payment's round-trip to Midtrans, logged either way. Returns the
 * outcome instead of throwing so both the sweep and the manual retry can
 * account for it.
 */
async function reconcileOnePayment(
  payment: PendingPayment,
  now: Date
): Promise<PaymentReconciliationResult | "UNCONFIGURED"> {
  // Credentials are per workspace, so this is decided per payment rather than
  // once for the whole sweep.
  const config = await getWorkspaceMidtransConfig(payment.workspaceId);
  if (!isMidtransConfigured(config)) return "UNCONFIGURED";

  try {
    const payload = await fetchMidtransTransactionStatus(
      payment.midtransOrderId,
      config
    );
    const mappedStatus = mapMidtransStatus(
      payload.transaction_status,
      payload.fraud_status
    );
    const result = await applyPaymentStatus(payment.id, mappedStatus, {
      transactionId: payload.transaction_id ?? null,
      transactionStatus: payload.transaction_status ?? null,
      paymentType: payload.payment_type ?? null,
      fraudStatus: payload.fraud_status ?? null,
      rawNotification: reconciliationPayload(payload, now),
    });

    const syncResult =
      result.changed && mappedStatus !== "PENDING" ? "SYNCED" : "UNCHANGED";
    await recordPaymentReconciliationEvent({
      payment,
      result: syncResult,
      mappedStatus,
      changedPayment: result.changed,
      payload,
      checkedAt: now,
    });
    return syncResult;
  } catch (error) {
    if (error instanceof MidtransApiError && error.status === 404) {
      await recordPaymentReconciliationEvent({
        payment,
        result: "NOT_FOUND",
        error: error.message,
        payload: error.payload,
        checkedAt: now,
      });
      return "NOT_FOUND";
    }

    await recordPaymentReconciliationEvent({
      payment,
      result: "FAILED",
      error: error instanceof Error ? error.message : "Sync failed.",
      payload: error instanceof MidtransApiError ? error.payload : null,
      checkedAt: now,
    });
    reportError("payments failed to reconcile", error, {
      context: { midtransOrderId: payment.midtransOrderId },
    });
    return "FAILED";
  }
}

type ReconciliationLogInput = {
  payment: PendingPayment;
  result: PaymentReconciliationResult;
  mappedStatus?: PaymentStatus | null;
  changedPayment?: boolean | null;
  error?: string | null;
  payload?: unknown;
  checkedAt: Date;
};

async function recordPaymentReconciliationEvent(input: ReconciliationLogInput) {
  const payload = toInputJson(input.payload);
  const midtrans = readMidtransPayload(input.payload);
  try {
    await prisma.paymentReconciliationEvent.create({
      data: {
        workspaceId: input.payment.workspaceId,
        paymentId: input.payment.id,
        result: input.result,
        midtransOrderId:
          midtrans.order_id?.slice(0, 200) ??
          input.payment.midtransOrderId.slice(0, 200),
        previousStatus: input.payment.status,
        mappedStatus: input.mappedStatus ?? null,
        transactionStatus: midtrans.transaction_status?.slice(0, 100) ?? null,
        fraudStatus: midtrans.fraud_status?.slice(0, 100) ?? null,
        transactionId: midtrans.transaction_id?.slice(0, 200) ?? null,
        paymentType: midtrans.payment_type?.slice(0, 100) ?? null,
        changedPayment: input.changedPayment ?? null,
        error: input.error?.slice(0, 1000) ?? null,
        payload,
        checkedAt: input.checkedAt,
      },
    });
  } catch (error) {
    console.warn("[payments] failed to record reconciliation event:", error);
  }
}

function reconciliationPayload(
  payload: MidtransTransactionStatus,
  checkedAt: Date
): Prisma.InputJsonValue {
  return {
    source: "midtrans_reconciliation",
    checkedAt: checkedAt.toISOString(),
    midtrans: payload,
  } as Prisma.InputJsonValue;
}

function readMidtransPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const root = value as Record<string, unknown>;
  return {
    order_id: stringValue(root.order_id),
    transaction_status: stringValue(root.transaction_status),
    fraud_status: stringValue(root.fraud_status),
    transaction_id: stringValue(root.transaction_id),
    payment_type: stringValue(root.payment_type),
  };
}

function toInputJson(value: unknown) {
  if (!value) return undefined;
  return value as Prisma.InputJsonValue;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60 * 1000);
}
