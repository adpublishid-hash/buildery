"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PaymentReconciliationResult } from "@prisma/client";

import { auth } from "@/lib/auth";
import { canInWorkspace } from "@/lib/permissions";
import { processOrderRefundProvider } from "@/lib/order-refunds";
import { cancelMidtransOrderPayment } from "@/lib/payment-cancellations";
import { reconcileMidtransPayment } from "@/lib/payment-reconciliation";
import { expireOverduePayment } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { revalidateCatalog } from "@/lib/storefront-catalog";
import { getCurrentWorkspace } from "@/lib/workspace";

/**
 * Operational follow-ups for the Payment Audit queue.
 *
 * Every one of these re-runs work a background job would eventually do
 * anyway, so they are all safe to press twice: the underlying services
 * re-read current state and no-op (or report a clear reason) when the row
 * has already moved on.
 */

type ActionResult = { ok: true; message: string } | { ok: false; error: string };

type Authorized =
  | { ok: true; workspaceId: string; actorId: string }
  | { ok: false; error: string };

async function authorize(): Promise<Authorized> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) {
    return { ok: false, error: "Not allowed." };
  }
  return {
    ok: true,
    workspaceId: current.workspace.id,
    actorId: session.user.id,
  };
}

/** Re-sends a refund to Midtrans after an earlier attempt errored out. */
export async function retryRefundProviderAction(
  refundId: string
): Promise<ActionResult> {
  const actor = await authorize();
  if (!actor.ok) return actor;

  const result = await processOrderRefundProvider(refundId, {
    workspaceId: actor.workspaceId,
    actorId: actor.actorId,
  });
  if (!result.ok) return result;

  revalidateAudit(result.orderId, actor.workspaceId);
  return { ok: true, message: "Refund Midtrans berhasil diproses." };
}

/** Re-sends a cancellation to Midtrans for a payment whose cancel failed. */
export async function retryCancelProviderAction(
  paymentId: string
): Promise<ActionResult> {
  const actor = await authorize();
  if (!actor.ok) return actor;

  // The cancellation service is addressed by order, not payment; the audit
  // row only knows the payment it found.
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, workspaceId: actor.workspaceId, kind: "ORDER" },
    select: { orderId: true },
  });
  if (!payment?.orderId) {
    return { ok: false, error: "Payment tidak ditemukan." };
  }

  const result = await cancelMidtransOrderPayment(payment.orderId, {
    workspaceId: actor.workspaceId,
    actorId: actor.actorId,
  });
  if (!result.ok) return result;

  revalidateAudit(result.orderId, actor.workspaceId);
  return { ok: true, message: "Cancel Midtrans berhasil diproses." };
}

/** Pulls the live Midtrans status for one pending payment. */
export async function reconcilePaymentAction(
  paymentId: string
): Promise<ActionResult> {
  const actor = await authorize();
  if (!actor.ok) return actor;

  const result = await reconcileMidtransPayment(paymentId, {
    workspaceId: actor.workspaceId,
  });
  if (!result.ok) return result;

  revalidateAudit(undefined, actor.workspaceId);
  return { ok: true, message: RECONCILE_MESSAGE[result.result] };
}

const RECONCILE_MESSAGE: Record<
  Exclude<PaymentReconciliationResult, "FAILED">,
  string
> = {
  SYNCED: "Status payment sudah disamakan dengan Midtrans.",
  UNCHANGED: "Midtrans masih melaporkan status yang sama.",
  NOT_FOUND: "Transaksi ini tidak ditemukan di Midtrans.",
};

/** Expires one pending payment that is already past its deadline. */
export async function expirePaymentAction(
  paymentId: string
): Promise<ActionResult> {
  const actor = await authorize();
  if (!actor.ok) return actor;

  const result = await expireOverduePayment(paymentId, {
    workspaceId: actor.workspaceId,
  });
  if (!result.ok) return result;

  revalidateAudit(undefined, actor.workspaceId);
  return {
    ok: true,
    message: result.changed
      ? "Payment sudah di-expire."
      : "Payment sudah final sebelumnya.",
  };
}

function revalidateAudit(orderId?: string, workspaceId?: string) {
  revalidatePath("/dashboard/payments/audit");
  revalidatePath("/dashboard/payments");
  revalidatePath("/dashboard/orders");
  if (orderId) revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath("/dashboard/products");
  // Expiring a payment releases its reserved stock, so the shop's cards change.
  if (workspaceId) revalidateCatalog(workspaceId);
}
