import "server-only";

import type { PaymentStatus, Prisma } from "@prisma/client";

import { recordInventoryMovement } from "@/lib/inventory-ledger";
import {
  MidtransApiError,
  requestMidtransCancel,
  type MidtransCancelResult,
} from "@/lib/midtrans";
import { prisma } from "@/lib/prisma";
import { reverseCommissionForOrderCancellation } from "@/lib/revenue-adjustments";
import { queueOrderNotifications } from "@/lib/store-notifications";
import { releaseOrderStockReservation } from "@/lib/stock-reservations";
import { getWorkspaceMidtransConfig } from "@/lib/ecommerce-settings";
import { reportError } from "@/lib/error-reporting";

type Tx = Prisma.TransactionClient;

type ServiceResult<T> = ({ ok: true } & T) | { ok: false; error: string };

export type CancelMidtransOrderPaymentInput = {
  workspaceId: string;
  actorId?: string | null;
  now?: Date;
};

type PaymentForCancellation = {
  id: string;
  workspaceId: string;
  kind: "ORDER" | "ENROLLMENT" | "MEMBERSHIP";
  status: PaymentStatus;
  provider: string;
  midtransOrderId: string;
  transactionId: string | null;
  transactionStatus: string | null;
  paymentType: string | null;
  fraudStatus: string | null;
  orderId: string | null;
};

type OrderForStockCancellation = {
  id: string;
  workspaceId: string;
  orderNumber: string;
  stockReservedAt: Date | null;
  stockReleasedAt: Date | null;
  items: {
    productId: string | null;
    variantId: string | null;
    nameSnapshot: string;
    quantity: number;
    product: { type: string } | null;
  }[];
};

export async function cancelMidtransOrderPayment(
  orderId: string,
  input: CancelMidtransOrderPaymentInput
): Promise<
  ServiceResult<{ paymentId: string; orderId: string; status: PaymentStatus }>
> {
  const now = input.now ?? new Date();
  const payment = await prisma.payment.findFirst({
    where: {
      orderId,
      workspaceId: input.workspaceId,
      kind: "ORDER",
    },
    select: paymentCancellationSelect(),
  });

  if (!payment) return { ok: false, error: "Payment not found." };
  const validation = validateCancelablePayment(payment);
  if (!validation.ok) return validation;

  const transactionRef = payment.transactionId || payment.midtransOrderId;
  try {
    const payload = await requestMidtransCancel(
      transactionRef,
      await getWorkspaceMidtransConfig(input.workspaceId)
    );
    if (!midtransCancelAccepted(payload)) {
      await recordProviderCancelAttempt(payment.id, {
        providerCancelStatus: midtransProviderStatus(payload) ?? "REJECTED",
        providerCancelReference:
          midtransProviderReference(payload) ?? transactionRef,
        providerCancelResponse: jsonFromUnknown(payload),
        providerCancelRequestedAt: now,
      });
      return {
        ok: false,
        error: midtransStatusMessage(payload) ?? "Midtrans rejected the cancellation.",
      };
    }

    return applyMidtransOrderCancellation(payment.id, {
      workspaceId: input.workspaceId,
      actorId: input.actorId ?? null,
      now,
      payload,
    });
  } catch (error) {
    if (error instanceof MidtransApiError) {
      await recordProviderCancelAttempt(payment.id, {
        providerCancelStatus: error.status ? `HTTP_${error.status}` : "FAILED",
        providerCancelReference: transactionRef,
        providerCancelResponse: jsonFromUnknown(error.payload),
        providerCancelRequestedAt: now,
      });
      return { ok: false, error: error.message };
    }
    reportError("payment-cancellations failed", error);
    return { ok: false, error: "Could not cancel the Midtrans transaction." };
  }
}

async function applyMidtransOrderCancellation(
  paymentId: string,
  input: {
    workspaceId: string;
    actorId: string | null;
    now: Date;
    payload: MidtransCancelResult;
  }
): Promise<
  ServiceResult<{ paymentId: string; orderId: string; status: PaymentStatus }>
> {
  return prisma.$transaction(
    async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        select: {
          ...paymentCancellationSelect(),
          order: {
            select: {
              id: true,
              workspaceId: true,
              orderNumber: true,
              status: true,
              fulfillmentStatus: true,
              stockReservedAt: true,
              stockReleasedAt: true,
              items: {
                select: {
                  productId: true,
                  variantId: true,
                  nameSnapshot: true,
                  quantity: true,
                  product: { select: { type: true } },
                },
              },
            },
          },
        },
      });
      if (!payment) return { ok: false, error: "Payment not found." };
      const validation = validateCancelablePayment(payment);
      if (!validation.ok) return validation;
      if (!payment.order || payment.order.workspaceId !== input.workspaceId) {
        return { ok: false, error: "Order not found." };
      }
      if (payment.order.fulfillmentStatus === "SHIPPED") {
        return {
          ok: false,
          error: "Shipped orders must be handled with refund/return instead.",
        };
      }
      if (payment.order.fulfillmentStatus === "DELIVERED") {
        return {
          ok: false,
          error: "Delivered orders must be handled with refund/return instead.",
        };
      }

      const previousPaymentStatus = payment.status;
      const transition = await tx.payment.updateMany({
        where: {
          id: payment.id,
          status: { in: ["PENDING", "PAID"] },
        },
        data: {
          status: "CANCELLED",
          transactionId:
            stringFromUnknown(input.payload.transaction_id) ??
            payment.transactionId,
          transactionStatus:
            stringFromUnknown(input.payload.transaction_status) ?? "cancel",
          paymentType:
            stringFromUnknown(input.payload.payment_type) ?? payment.paymentType,
          fraudStatus:
            stringFromUnknown(input.payload.fraud_status) ?? payment.fraudStatus,
          rawNotification: {
            source: "midtrans_cancel",
            midtrans: jsonFromUnknown(input.payload),
          },
          providerCancelStatus:
            midtransProviderStatus(input.payload) ?? "cancel",
          providerCancelReference:
            midtransProviderReference(input.payload) ??
            payment.transactionId ??
            payment.midtransOrderId,
          providerCancelResponse: jsonFromUnknown(input.payload),
          providerCancelRequestedAt: input.now,
        },
      });
      if (transition.count !== 1) {
        return {
          ok: false,
          error: "Payment was already updated by another process.",
        };
      }

      await tx.order.update({
        where: { id: payment.order.id },
        data: { status: "CANCELLED" },
      });

      if (payment.order.fulfillmentStatus !== "NOT_REQUIRED") {
        await tx.order.updateMany({
          where: {
            id: payment.order.id,
            fulfillmentStatus: { not: "NOT_REQUIRED" },
          },
          data: { fulfillmentStatus: "CANCELLED" },
        });
        await tx.fulfillmentEvent.create({
          data: {
            workspaceId: payment.order.workspaceId,
            orderId: payment.order.id,
            actorId: input.actorId,
            status: "CANCELLED",
            note: "Midtrans transaction was cancelled before settlement.",
          },
        });
      }

      await reverseOrderStockForCancellation(
        tx,
        payment.order,
        previousPaymentStatus,
        input.actorId
      );
      await reverseCommissionForOrderCancellation(tx, payment.order.id);
      await queueOrderNotifications(tx, payment.order.id, "PAYMENT_CANCELLED");

      return {
        ok: true,
        paymentId: payment.id,
        orderId: payment.order.id,
        status: "CANCELLED",
      };
    },
    { isolationLevel: "Serializable" }
  );
}

async function reverseOrderStockForCancellation(
  tx: Tx,
  order: OrderForStockCancellation,
  previousPaymentStatus: PaymentStatus,
  actorId: string | null
) {
  if (order.stockReservedAt && !order.stockReleasedAt) {
    await releaseOrderStockReservation(tx, order.id);
    return;
  }

  if (previousPaymentStatus !== "PAID" || order.stockReservedAt) return;

  const merged = new Map<string, { productId: string; variantId: string | null; name: string; quantity: number }>();
  for (const item of order.items) {
    if (!item.productId || item.product?.type !== "PHYSICAL") continue;
    const key = `${item.productId}:${item.variantId ?? "base"}`;
    const current = merged.get(key) ?? {
      productId: item.productId,
      variantId: item.variantId,
      name: item.nameSnapshot,
      quantity: 0,
    };
    current.quantity += Math.max(0, item.quantity);
    merged.set(key, current);
  }

  for (const line of merged.values()) {
    if (line.quantity <= 0) continue;
    if (line.variantId) {
      await tx.productVariant.updateMany({ where: { id: line.variantId, productId: line.productId }, data: { stock: { increment: line.quantity } } });
    }
    const updated = await tx.product.updateMany({
      where: { id: line.productId, type: "PHYSICAL" },
      data: { stock: { increment: line.quantity } },
    });
    if (updated.count !== 1) {
      throw new Error(`Could not restore stock for ${line.name}.`);
    }
    const product = await tx.product.findUnique({
      where: { id: line.productId },
      select: { stock: true },
    });
    if (!product) continue;

    await recordInventoryMovement(tx, {
      workspaceId: order.workspaceId,
      productId: line.productId,
      orderId: order.id,
      actorId,
      type: "ORDER_CANCELLATION",
      quantityChange: line.quantity,
      stockBefore: product.stock - line.quantity,
      stockAfter: product.stock,
      reason: `Cancelled order ${order.orderNumber} before settlement`,
    });
  }
}

async function recordProviderCancelAttempt(
  paymentId: string,
  input: {
    providerCancelStatus: string;
    providerCancelReference: string;
    providerCancelResponse: Prisma.InputJsonValue;
    providerCancelRequestedAt: Date;
  }
) {
  await prisma.payment.update({
    where: { id: paymentId },
    data: input,
  });
}

function validateCancelablePayment(
  payment: PaymentForCancellation | null | undefined
): ServiceResult<{ payment: PaymentForCancellation }> {
  if (!payment) return { ok: false, error: "Payment not found." };
  if (payment.workspaceId === undefined) {
    return { ok: false, error: "Payment not found." };
  }
  if (payment.provider !== "midtrans") {
    return {
      ok: false,
      error: "Only Midtrans payments can be cancelled automatically.",
    };
  }
  if (payment.status === "CANCELLED") {
    return { ok: false, error: "Payment is already cancelled." };
  }
  if (payment.status === "FAILED" || payment.status === "EXPIRED") {
    return { ok: false, error: "Only pending or unsettled paid payments can be cancelled." };
  }
  if (payment.status === "PAID" && !isProviderVoidableStatus(payment.transactionStatus)) {
    return {
      ok: false,
      error:
        "Settled Midtrans payments must be handled with refund/return instead.",
    };
  }
  if (payment.status !== "PENDING" && payment.status !== "PAID") {
    return { ok: false, error: "Only pending or unsettled paid payments can be cancelled." };
  }
  if (!payment.orderId || payment.kind !== "ORDER") {
    return { ok: false, error: "Only order payments can be cancelled here." };
  }
  return { ok: true, payment };
}

function isProviderVoidableStatus(status: string | null | undefined) {
  return status === "capture" || status === "authorize";
}

function midtransCancelAccepted(payload: MidtransCancelResult) {
  return (
    stringFromUnknown(payload.status_code) === "200" &&
    stringFromUnknown(payload.transaction_status) === "cancel"
  );
}

function midtransProviderStatus(payload: MidtransCancelResult) {
  return (
    stringFromUnknown(payload.transaction_status) ??
    stringFromUnknown(payload.status_code)
  );
}

function midtransProviderReference(payload: MidtransCancelResult) {
  return (
    stringFromUnknown(payload.transaction_id) ??
    stringFromUnknown(payload.order_id)
  );
}

function midtransStatusMessage(payload: MidtransCancelResult) {
  return stringFromUnknown(payload.status_message);
}

function paymentCancellationSelect() {
  return {
    id: true,
    workspaceId: true,
    kind: true,
    status: true,
    provider: true,
    midtransOrderId: true,
    transactionId: true,
    transactionStatus: true,
    paymentType: true,
    fraudStatus: true,
    orderId: true,
  } satisfies Prisma.PaymentSelect;
}

function jsonFromUnknown(value: unknown): Prisma.InputJsonValue {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Prisma.InputJsonObject;
  }
  return {};
}

function stringFromUnknown(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}
