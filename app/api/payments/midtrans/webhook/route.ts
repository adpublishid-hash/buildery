import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  isMidtransConfigured,
  mapMidtransStatus,
  verifyMidtransSignature,
  type MidtransNotification,
} from "@/lib/midtrans";
import { applyPaymentStatus } from "@/lib/payments";
import { recordPaymentWebhookEvent } from "@/lib/payment-webhooks";
import { getWorkspaceMidtransConfig } from "@/lib/ecommerce-settings";
import { reportError } from "@/lib/error-reporting";

/**
 * Midtrans payment notification (webhook). Verifies the signature, maps
 * the transaction status, and applies it to the payment + its resource.
 *
 * Always responds 200 for handled notifications so Midtrans stops
 * retrying; only signature/format failures return an error code.
 */
export async function POST(req: NextRequest) {
  if (!isMidtransConfigured()) {
    return NextResponse.json(
      { error: "Midtrans not configured" },
      { status: 503 }
    );
  }

  let notification: MidtransNotification;
  try {
    notification = (await req.json()) as MidtransNotification;
  } catch {
    await recordPaymentWebhookEvent({
      result: "INVALID_BODY",
      signatureValid: null,
      error: "Invalid JSON body.",
    });
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // The signing key is the workspace's own, so the payment has to be resolved
  // before the signature can be checked. The lookup trusts the payload only as
  // far as reading an order id — an unknown one is rejected below either way.
  const signingPayment = await prisma.payment.findUnique({
    where: { midtransOrderId: notification.order_id ?? "" },
    select: { workspaceId: true },
  });
  const midtransConfig = signingPayment
    ? await getWorkspaceMidtransConfig(signingPayment.workspaceId)
    : null;

  if (!verifyMidtransSignature(notification, midtransConfig)) {
    console.warn("[midtrans] webhook signature mismatch");
    await recordPaymentWebhookEvent({
      result: "BAD_SIGNATURE",
      signatureValid: false,
      midtransOrderId: notification.order_id ?? null,
      transactionStatus: notification.transaction_status ?? null,
      fraudStatus: notification.fraud_status ?? null,
      transactionId: notification.transaction_id ?? null,
      paymentType: notification.payment_type ?? null,
      error: "Signature mismatch.",
      payload: notification as unknown as Prisma.InputJsonValue,
    });
    return NextResponse.json({ error: "Bad signature" }, { status: 403 });
  }

  const payment = await prisma.payment.findUnique({
    where: { midtransOrderId: notification.order_id ?? "" },
  });
  if (!payment) {
    await recordPaymentWebhookEvent({
      result: "UNKNOWN_PAYMENT",
      signatureValid: true,
      midtransOrderId: notification.order_id ?? null,
      transactionStatus: notification.transaction_status ?? null,
      fraudStatus: notification.fraud_status ?? null,
      transactionId: notification.transaction_id ?? null,
      paymentType: notification.payment_type ?? null,
      payload: notification as unknown as Prisma.InputJsonValue,
    });
    // Unknown order — acknowledge so Midtrans stops retrying.
    return NextResponse.json({ received: true });
  }

  const status = mapMidtransStatus(
    notification.transaction_status,
    notification.fraud_status
  );

  try {
    const result = await applyPaymentStatus(payment.id, status, {
      transactionId: notification.transaction_id ?? null,
      transactionStatus: notification.transaction_status ?? null,
      paymentType: notification.payment_type ?? null,
      fraudStatus: notification.fraud_status ?? null,
      rawNotification: notification as unknown as Prisma.InputJsonValue,
    });
    await recordPaymentWebhookEvent({
      workspaceId: payment.workspaceId,
      paymentId: payment.id,
      result: "PROCESSED",
      signatureValid: true,
      midtransOrderId: notification.order_id ?? payment.midtransOrderId,
      mappedStatus: status,
      transactionStatus: notification.transaction_status ?? null,
      fraudStatus: notification.fraud_status ?? null,
      transactionId: notification.transaction_id ?? null,
      paymentType: notification.payment_type ?? null,
      changedPayment: result.changed,
      payload: notification as unknown as Prisma.InputJsonValue,
    });
  } catch (error) {
    reportError("midtrans webhook processing failed", error);
    await recordPaymentWebhookEvent({
      workspaceId: payment.workspaceId,
      paymentId: payment.id,
      result: "PROCESSING_FAILED",
      signatureValid: true,
      midtransOrderId: notification.order_id ?? payment.midtransOrderId,
      mappedStatus: status,
      transactionStatus: notification.transaction_status ?? null,
      fraudStatus: notification.fraud_status ?? null,
      transactionId: notification.transaction_id ?? null,
      paymentType: notification.payment_type ?? null,
      error: error instanceof Error ? error.message : "Processing failed.",
      payload: notification as unknown as Prisma.InputJsonValue,
    });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
