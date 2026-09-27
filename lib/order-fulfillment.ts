import "server-only";

import type {
  FulfillmentStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

const TERMINAL_ORDER_STATUSES: OrderStatus[] = ["CANCELLED", "FAILED", "EXPIRED"];

export const FULFILLMENT_STATUSES: FulfillmentStatus[] = [
  "NOT_REQUIRED",
  "UNFULFILLED",
  "PACKED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
];

export type FulfillmentUpdateInput = {
  workspaceId: string;
  actorId?: string | null;
  status: FulfillmentStatus;
  trackingCarrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  note?: string | null;
  now?: Date;
};

export type FulfillmentUpdateResult =
  | { ok: true; orderId: string; status: FulfillmentStatus }
  | { ok: false; error: string };

export async function updateOrderFulfillment(
  orderId: string,
  input: FulfillmentUpdateInput
): Promise<FulfillmentUpdateResult> {
  const now = input.now ?? new Date();
  const status = input.status;
  const trackingCarrier = cleanText(input.trackingCarrier, 80);
  const trackingNumber = cleanText(input.trackingNumber, 120);
  const trackingUrl = cleanUrl(input.trackingUrl);
  const note = cleanText(input.note, 1000);

  if (!FULFILLMENT_STATUSES.includes(status)) {
    return { ok: false, error: "Invalid fulfillment status." };
  }
  if (input.trackingUrl && !trackingUrl) {
    return { ok: false, error: "Tracking URL must start with http:// or https://." };
  }

  return prisma.$transaction(async (trx) => {
    const order = await trx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        workspaceId: true,
        status: true,
        fulfillmentStatus: true,
        packedAt: true,
        shippedAt: true,
        deliveredAt: true,
        shippingAddress: true,
        payment: { select: { status: true } },
        items: {
          select: {
            product: { select: { type: true } },
          },
        },
      },
    });

    if (!order || order.workspaceId !== input.workspaceId) {
      return { ok: false, error: "Order not found." };
    }
    if (status !== "NOT_REQUIRED" && !requiresFulfillment(order)) {
      return {
        ok: false,
        error: "This order does not contain physical products.",
      };
    }

    const data = fulfillmentOrderData({
      currentOrderStatus: order.status,
      paymentStatus: order.payment?.status ?? null,
      currentFulfillmentStatus: order.fulfillmentStatus,
      packedAt: order.packedAt,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      nextStatus: status,
      trackingCarrier,
      trackingNumber,
      trackingUrl,
      note,
      now,
    });

    await trx.order.update({
      where: { id: order.id },
      data,
    });

    await trx.fulfillmentEvent.create({
      data: {
        workspaceId: input.workspaceId,
        orderId: order.id,
        actorId: input.actorId ?? null,
        status,
        trackingCarrier,
        trackingNumber,
        trackingUrl,
        note,
      },
    });

    return { ok: true, orderId: order.id, status };
  });
}

export function fulfillmentStatusLabel(status: FulfillmentStatus) {
  if (status === "NOT_REQUIRED") return "No fulfillment needed";
  if (status === "UNFULFILLED") return "Unfulfilled";
  if (status === "PACKED") return "Packed";
  if (status === "SHIPPED") return "Shipped";
  if (status === "DELIVERED") return "Delivered";
  return "Cancelled";
}

function fulfillmentOrderData(input: {
  currentOrderStatus: OrderStatus;
  paymentStatus: PaymentStatus | null;
  currentFulfillmentStatus: FulfillmentStatus;
  packedAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  nextStatus: FulfillmentStatus;
  trackingCarrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  note: string | null;
  now: Date;
}) {
  const orderStatus = nextOrderStatus(
    input.currentOrderStatus,
    input.paymentStatus,
    input.nextStatus
  );

  return {
    fulfillmentStatus: input.nextStatus,
    fulfillmentTrackingCarrier: input.trackingCarrier,
    fulfillmentTrackingNumber: input.trackingNumber,
    fulfillmentTrackingUrl: input.trackingUrl,
    fulfillmentNote: input.note,
    packedAt:
      input.nextStatus === "PACKED" ||
      input.nextStatus === "SHIPPED" ||
      input.nextStatus === "DELIVERED"
        ? input.packedAt ?? input.now
        : input.packedAt,
    shippedAt:
      input.nextStatus === "SHIPPED" || input.nextStatus === "DELIVERED"
        ? input.shippedAt ?? input.now
        : input.shippedAt,
    deliveredAt:
      input.nextStatus === "DELIVERED"
        ? input.deliveredAt ?? input.now
        : input.deliveredAt,
    ...(orderStatus !== input.currentOrderStatus ? { status: orderStatus } : {}),
  } satisfies Prisma.OrderUpdateInput;
}

function nextOrderStatus(
  current: OrderStatus,
  paymentStatus: PaymentStatus | null,
  fulfillmentStatus: FulfillmentStatus
) {
  if (TERMINAL_ORDER_STATUSES.includes(current)) return current;
  if (fulfillmentStatus === "DELIVERED" && paymentStatus === "PAID") {
    return "COMPLETED";
  }
  if (
    (fulfillmentStatus === "PACKED" || fulfillmentStatus === "SHIPPED") &&
    current === "PAID"
  ) {
    return "PROCESSING";
  }
  return current;
}

function requiresFulfillment(order: {
  shippingAddress?: string | null;
  items: { product: { type: string } | null }[];
}) {
  return Boolean(order.shippingAddress) || order.items.some((item) => item.product?.type === "PHYSICAL");
}

function cleanText(value: string | null | undefined, maxLength: number) {
  const text = value?.trim();
  return text ? text.slice(0, maxLength) : null;
}

function cleanUrl(value: string | null | undefined) {
  const text = cleanText(value, 500);
  if (!text) return null;
  return /^https?:\/\//i.test(text) ? text : null;
}
