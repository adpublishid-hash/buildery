import "server-only";

import type {
  Prisma,
  PrismaClient,
  RefundStatus,
  RefundType,
  StoreNotificationEvent,
} from "@prisma/client";

import { recordInventoryMovement } from "@/lib/inventory-ledger";
import {
  MidtransApiError,
  requestMidtransRefund,
  type MidtransRefundResult,
} from "@/lib/midtrans";
import { prisma } from "@/lib/prisma";
import { adjustCommissionForRefund } from "@/lib/revenue-adjustments";
import { queueRefundNotification } from "@/lib/store-notifications";
import { queueGa4Refund } from "@/lib/ga4-measurement";
import { getWorkspaceMidtransConfig } from "@/lib/ecommerce-settings";
import { reportError } from "@/lib/error-reporting";

type Tx = Prisma.TransactionClient | PrismaClient;

type ServiceResult<T> = ({ ok: true } & T) | { ok: false; error: string };

export type OrderRefundItemInput = {
  orderItemId: string;
  quantity: number;
  restockQuantity?: number;
};

/** A file already written to disk by the evidence upload route. */
export type OrderRefundEvidenceInput = {
  url: string;
  name: string;
  mimeType: string;
  size: number;
};

export type CreateOrderRefundInput = {
  workspaceId: string;
  actorId?: string | null;
  type?: RefundType;
  status?: RefundStatus;
  amount: number;
  reason?: string | null;
  note?: string | null;
  provider?: string | null;
  providerRefundKey?: string | null;
  providerReference?: string | null;
  providerStatus?: string | null;
  providerResponse?: Prisma.InputJsonValue;
  providerRequestedAt?: Date | null;
  returnToStock?: boolean;
  items?: OrderRefundItemInput[];
  evidence?: OrderRefundEvidenceInput[];
  notify?: boolean;
  now?: Date;
};

export type UpdateOrderRefundStatusInput = {
  workspaceId: string;
  actorId?: string | null;
  status: RefundStatus;
  note?: string | null;
  provider?: string | null;
  providerRefundKey?: string | null;
  providerReference?: string | null;
  providerStatus?: string | null;
  providerResponse?: Prisma.InputJsonValue;
  providerRequestedAt?: Date | null;
  now?: Date;
};

export type ProcessOrderRefundProviderInput = {
  workspaceId: string;
  actorId?: string | null;
  direct?: boolean;
  now?: Date;
};

type OrderItemForRefund = {
  id: string;
  productId: string | null;
  nameSnapshot: string;
  quantity: number;
  product: { type: string } | null;
  refundItems: {
    quantity: number;
    restockQuantity: number;
    refund: { status: RefundStatus };
  }[];
};

type RefundForRestock = {
  id: string;
  workspaceId: string;
  orderId: string;
  reason: string | null;
  order: { orderNumber: string };
  items: {
    orderItemId: string;
    productId: string | null;
    restockQuantity: number;
    orderItem: { nameSnapshot: string; variantId: string | null };
    product: { type: string } | null;
  }[];
};

type RefundTimestamps = {
  approvedAt: Date | null;
  rejectedAt: Date | null;
  refundedAt: Date | null;
  cancelledAt: Date | null;
};

const REFUND_STATUSES: RefundStatus[] = [
  "REQUESTED",
  "APPROVED",
  "REJECTED",
  "REFUNDED",
  "CANCELLED",
];

const REFUND_TYPES: RefundType[] = ["REFUND", "RETURN"];
const ACTIVE_REFUND_STATUSES = new Set<RefundStatus>([
  "REQUESTED",
  "APPROVED",
  "REFUNDED",
]);
const CLOSED_REFUND_STATUSES = new Set<RefundStatus>([
  "REJECTED",
  "REFUNDED",
  "CANCELLED",
]);

class OrderRefundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderRefundError";
  }
}

export async function createOrderRefund(
  orderId: string,
  input: CreateOrderRefundInput
): Promise<ServiceResult<{ refundId: string; status: RefundStatus }>> {
  const now = input.now ?? new Date();
  const status = input.status ?? "REQUESTED";
  const type = input.type ?? "REFUND";

  if (!REFUND_STATUSES.includes(status)) {
    return { ok: false, error: "Invalid refund status." };
  }
  if (!REFUND_TYPES.includes(type)) {
    return { ok: false, error: "Invalid refund type." };
  }
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    return { ok: false, error: "Refund amount must be zero or greater." };
  }

  try {
    const result = await prisma.$transaction<
      ServiceResult<{ refundId: string; status: RefundStatus }>
    >(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          workspaceId: true,
          customerId: true,
          orderNumber: true,
          total: true,
          refunds: { select: { amount: true, status: true } },
          items: {
            select: {
              id: true,
              productId: true,
              nameSnapshot: true,
              quantity: true,
              product: { select: { type: true } },
              refundItems: {
                select: {
                  quantity: true,
                  restockQuantity: true,
                  refund: { select: { status: true } },
                },
              },
            },
          },
        },
      });
      if (!order || order.workspaceId !== input.workspaceId) {
        return { ok: false, error: "Order not found." };
      }

      const amount = Math.floor(input.amount);
      const activeRefundAmount = order.refunds
        .filter((refund) => ACTIVE_REFUND_STATUSES.has(refund.status))
        .reduce((sum, refund) => sum + Math.max(0, refund.amount), 0);
      const remainingAmount = Math.max(0, order.total - activeRefundAmount);
      if (amount > remainingAmount) {
        return {
          ok: false,
          error: `Refund amount exceeds the remaining refundable amount (${remainingAmount}).`,
        };
      }

      const items = normalizeRefundItems(
        order.items,
        input.items ?? [],
        Boolean(input.returnToStock)
      );
      const restockQuantity = items.reduce(
        (sum, item) => sum + item.restockQuantity,
        0
      );
      if (amount === 0 && items.length === 0) {
        return { ok: false, error: "Add a refund amount or item quantity." };
      }
      if (input.returnToStock && restockQuantity === 0) {
        return { ok: false, error: "Choose at least one physical item to restock." };
      }

      const refund = await tx.orderRefund.create({
        data: {
          workspaceId: order.workspaceId,
          orderId: order.id,
          customerId: order.customerId,
          actorId: input.actorId ?? null,
          type,
          status,
          amount,
          reason: cleanText(input.reason),
          note: cleanText(input.note),
          provider: cleanText(input.provider) ?? "manual",
          providerRefundKey: cleanText(input.providerRefundKey),
          providerReference: cleanText(input.providerReference),
          providerStatus: cleanText(input.providerStatus),
          providerResponse: input.providerResponse,
          providerRequestedAt: input.providerRequestedAt ?? null,
          returnToStock: Boolean(input.returnToStock),
          ...timestampDataFor(status, now),
          items: items.length
            ? {
                create: items.map((item) => ({
                  orderItemId: item.orderItemId,
                  productId: item.productId,
                  quantity: item.quantity,
                  restockQuantity: item.restockQuantity,
                })),
              }
            : undefined,
          evidence: input.evidence?.length
            ? {
                create: input.evidence.map((file) => ({
                  url: file.url,
                  name: file.name.slice(0, 200),
                  mimeType: file.mimeType.slice(0, 100),
                  size: Math.max(0, Math.floor(file.size)),
                })),
              }
            : undefined,
        },
        include: refundRestockInclude(),
      });

      if (status === "REFUNDED" && refund.returnToStock) {
        await restockRefundItems(tx, refund, input.actorId ?? null);
        await tx.orderRefund.update({
          where: { id: refund.id },
          data: { restockedAt: now },
        });
      }
      if (status === "REFUNDED") {
        await adjustCommissionForRefund(tx, refund.id);
      }
      if (input.notify !== false) {
        await queueRefundNotification(tx, refund.id, refundEventForStatus(status));
      }

      return { ok: true, refundId: refund.id, status };
    });
    if (result.ok && status === "REFUNDED") {
      reportRefundToAnalytics(input.workspaceId, result.refundId);
    }
    return result;
  } catch (error) {
    return handleRefundError(error);
  }
}

export async function updateOrderRefundStatus(
  refundId: string,
  input: UpdateOrderRefundStatusInput
): Promise<
  ServiceResult<{ refundId: string; orderId: string; status: RefundStatus }>
> {
  const now = input.now ?? new Date();
  if (!REFUND_STATUSES.includes(input.status)) {
    return { ok: false, error: "Invalid refund status." };
  }

  try {
    const result = await prisma.$transaction<
      ServiceResult<{ refundId: string; orderId: string; status: RefundStatus }>
    >(async (tx) => {
      const refund = await tx.orderRefund.findUnique({
        where: { id: refundId },
        include: refundRestockInclude(),
      });
      if (!refund || refund.workspaceId !== input.workspaceId) {
        return { ok: false, error: "Refund not found." };
      }
      if (
        CLOSED_REFUND_STATUSES.has(refund.status) &&
        refund.status !== input.status
      ) {
        return {
          ok: false,
          error: "Closed refunds cannot be reopened. Create a new refund record instead.",
        };
      }

      const data: Prisma.OrderRefundUpdateInput = {
        status: input.status,
        ...timestampDataFor(input.status, now, refund),
      };
      if (input.note !== undefined) {
        data.note = cleanText(input.note);
      }
      if (input.provider !== undefined) {
        data.provider = cleanText(input.provider) ?? "manual";
      }
      if (input.providerRefundKey !== undefined) {
        data.providerRefundKey = cleanText(input.providerRefundKey);
      }
      if (input.providerReference !== undefined) {
        data.providerReference = cleanText(input.providerReference);
      }
      if (input.providerStatus !== undefined) {
        data.providerStatus = cleanText(input.providerStatus);
      }
      if (input.providerResponse !== undefined) {
        data.providerResponse = input.providerResponse;
      }
      if (input.providerRequestedAt !== undefined) {
        data.providerRequestedAt = input.providerRequestedAt;
      }

      if (input.status === "REFUNDED" && refund.returnToStock && !refund.restockedAt) {
        const claimed = await tx.orderRefund.updateMany({
          where: {
            id: refund.id,
            returnToStock: true,
            restockedAt: null,
          },
          data: { restockedAt: now },
        });
        if (claimed.count === 1) {
          await restockRefundItems(tx, refund, input.actorId ?? null);
        }
      }

      await tx.orderRefund.update({
        where: { id: refund.id },
        data,
      });
      if (input.status === "REFUNDED") {
        await adjustCommissionForRefund(tx, refund.id);
      }
      if (refund.status !== input.status) {
        await queueRefundNotification(
          tx,
          refund.id,
          refundEventForStatus(input.status)
        );
      }

      return {
        ok: true,
        refundId: refund.id,
        orderId: refund.orderId,
        status: input.status,
      };
    });
    if (result.ok && input.status === "REFUNDED") {
      reportRefundToAnalytics(input.workspaceId, result.refundId);
    }
    return result;
  } catch (error) {
    return handleRefundError(error);
  }
}

export async function processOrderRefundProvider(
  refundId: string,
  input: ProcessOrderRefundProviderInput
): Promise<
  ServiceResult<{ refundId: string; orderId: string; status: RefundStatus }>
> {
  const now = input.now ?? new Date();
  const refund = await prisma.orderRefund.findUnique({
    where: { id: refundId },
    include: {
      order: {
        select: {
          orderNumber: true,
          payment: {
            select: {
              status: true,
              provider: true,
              midtransOrderId: true,
              transactionId: true,
              transactionStatus: true,
              paymentType: true,
            },
          },
        },
      },
    },
  });

  if (!refund || refund.workspaceId !== input.workspaceId) {
    return { ok: false, error: "Refund not found." };
  }
  if (CLOSED_REFUND_STATUSES.has(refund.status)) {
    return {
      ok: false,
      error: "Closed refunds cannot be processed again.",
    };
  }
  if (refund.amount <= 0) {
    return {
      ok: false,
      error: "Midtrans refund requires an amount greater than zero.",
    };
  }

  const payment = refund.order.payment;
  if (!payment) {
    return { ok: false, error: "Order payment was not found." };
  }
  if (payment.provider !== "midtrans") {
    return {
      ok: false,
      error: "Only Midtrans payments can be refunded automatically.",
    };
  }
  if (payment.status !== "PAID") {
    return {
      ok: false,
      error: "Only paid Midtrans transactions can be refunded.",
    };
  }
  if (isKnownNonRefundableTransactionStatus(payment.transactionStatus)) {
    return {
      ok: false,
      error:
        "Midtrans Refund API requires a settled transaction. Use provider cancellation for pending, authorize, or capture transactions.",
    };
  }

  const refundKey = cleanMidtransRefundKey(
    refund.providerRefundKey ?? `refund_${refund.id}`
  );
  const transactionRef = payment.transactionId || payment.midtransOrderId;

  try {
    const payload = await requestMidtransRefund({
      transactionRef,
      refundKey,
      amount: refund.amount,
      reason:
        refund.reason ??
        `Refund order ${refund.order.orderNumber}`.slice(0, 255),
      direct: input.direct,
    }, await getWorkspaceMidtransConfig(input.workspaceId));

    if (!midtransRefundAccepted(payload)) {
      await recordProviderAttempt(refund.id, {
        providerRefundKey: refundKey,
        providerStatus: midtransProviderStatus(payload) ?? "REJECTED",
        providerReference: midtransProviderReference(payload, refundKey),
        providerResponse: jsonFromUnknown(payload),
        providerRequestedAt: now,
      });
      return {
        ok: false,
        error: midtransStatusMessage(payload) ?? "Midtrans rejected the refund.",
      };
    }

    return updateOrderRefundStatus(refund.id, {
      workspaceId: input.workspaceId,
      actorId: input.actorId ?? null,
      status: "REFUNDED",
      provider: "midtrans",
      providerRefundKey: refundKey,
      providerStatus: midtransProviderStatus(payload) ?? "ACCEPTED",
      providerReference: midtransProviderReference(payload, refundKey),
      providerResponse: jsonFromUnknown(payload),
      providerRequestedAt: now,
      now,
    });
  } catch (error) {
    if (error instanceof MidtransApiError) {
      await recordProviderAttempt(refund.id, {
        providerRefundKey: refundKey,
        providerStatus: error.status ? `HTTP_${error.status}` : "FAILED",
        providerReference: refund.providerReference ?? refundKey,
        providerResponse: jsonFromUnknown(error.payload),
        providerRequestedAt: now,
      });
      return { ok: false, error: error.message };
    }
    return handleRefundError(error);
  }
}

function normalizeRefundItems(
  orderItems: OrderItemForRefund[],
  inputItems: OrderRefundItemInput[],
  returnToStock: boolean
) {
  const orderItemById = new Map(orderItems.map((item) => [item.id, item]));
  const requested = new Map<
    string,
    { quantity: number; restockQuantity: number }
  >();

  for (const item of inputItems) {
    if (!item.orderItemId) continue;
    const existing = requested.get(item.orderItemId) ?? {
      quantity: 0,
      restockQuantity: 0,
    };
    existing.quantity += normalizeQuantity(item.quantity);
    existing.restockQuantity += returnToStock
      ? normalizeQuantity(item.restockQuantity ?? 0)
      : 0;
    requested.set(item.orderItemId, existing);
  }

  const normalized: {
    orderItemId: string;
    productId: string | null;
    quantity: number;
    restockQuantity: number;
  }[] = [];

  for (const [orderItemId, item] of requested) {
    const orderItem = orderItemById.get(orderItemId);
    if (!orderItem) {
      throw new OrderRefundError("A selected refund item does not belong to this order.");
    }

    if (item.quantity === 0 && item.restockQuantity === 0) continue;

    const refundedQuantity = activeRefundQuantity(orderItem, "quantity");
    const restockedQuantity = activeRefundQuantity(orderItem, "restockQuantity");
    const refundableQuantity = Math.max(0, orderItem.quantity - refundedQuantity);
    const restockableQuantity = Math.max(0, orderItem.quantity - restockedQuantity);

    if (item.quantity > refundableQuantity) {
      throw new OrderRefundError(
        `"${orderItem.nameSnapshot}" only has ${refundableQuantity} refundable item(s) left.`
      );
    }
    if (item.restockQuantity > item.quantity) {
      throw new OrderRefundError(
        `"${orderItem.nameSnapshot}" restock quantity cannot exceed refunded quantity.`
      );
    }
    if (item.restockQuantity > restockableQuantity) {
      throw new OrderRefundError(
        `"${orderItem.nameSnapshot}" only has ${restockableQuantity} restockable item(s) left.`
      );
    }
    if (
      item.restockQuantity > 0 &&
      (!orderItem.productId || orderItem.product?.type !== "PHYSICAL")
    ) {
      throw new OrderRefundError(
        `"${orderItem.nameSnapshot}" is not a physical product and cannot be restocked.`
      );
    }

    normalized.push({
      orderItemId,
      productId: orderItem.productId,
      quantity: item.quantity,
      restockQuantity: item.restockQuantity,
    });
  }

  return normalized;
}

async function restockRefundItems(
  tx: Tx,
  refund: RefundForRestock,
  actorId: string | null
) {
  for (const item of refund.items) {
    if (item.restockQuantity <= 0) continue;
    if (!item.productId || item.product?.type !== "PHYSICAL") {
      throw new OrderRefundError(
        `"${item.orderItem.nameSnapshot}" cannot be restocked.`
      );
    }
    if (item.orderItem.variantId) {
      await tx.productVariant.updateMany({
        where: { id: item.orderItem.variantId, productId: item.productId },
        data: { stock: { increment: item.restockQuantity } },
      });
    }

    const updated = await tx.product.updateMany({
      where: { id: item.productId, type: "PHYSICAL" },
      data: { stock: { increment: item.restockQuantity } },
    });
    if (updated.count !== 1) {
      throw new OrderRefundError(
        `Could not restock "${item.orderItem.nameSnapshot}".`
      );
    }

    const product = await tx.product.findUnique({
      where: { id: item.productId },
      select: { stock: true },
    });
    if (!product) continue;

    await recordInventoryMovement(tx, {
      workspaceId: refund.workspaceId,
      productId: item.productId,
      orderId: refund.orderId,
      actorId,
      type: "ORDER_RETURN",
      quantityChange: item.restockQuantity,
      stockBefore: product.stock - item.restockQuantity,
      stockAfter: product.stock,
      reason:
        refund.reason ??
        `Returned stock for order ${refund.order.orderNumber}: ${item.orderItem.nameSnapshot}`,
      metadata: {
        refundId: refund.id,
        orderItemId: item.orderItemId,
      },
    });
  }
}

function refundRestockInclude() {
  return {
    order: { select: { orderNumber: true } },
    items: {
      include: {
        orderItem: { select: { nameSnapshot: true, variantId: true } },
        product: { select: { type: true } },
      },
    },
  } satisfies Prisma.OrderRefundInclude;
}

function activeRefundQuantity(
  orderItem: OrderItemForRefund,
  field: "quantity" | "restockQuantity"
) {
  return orderItem.refundItems
    .filter((item) => ACTIVE_REFUND_STATUSES.has(item.refund.status))
    .reduce((sum, item) => sum + Math.max(0, item[field]), 0);
}

function timestampDataFor(
  status: RefundStatus,
  now: Date,
  existing?: RefundTimestamps
) {
  const data: {
    approvedAt?: Date;
    rejectedAt?: Date;
    refundedAt?: Date;
    cancelledAt?: Date;
  } = {};
  if ((status === "APPROVED" || status === "REFUNDED") && !existing?.approvedAt) {
    data.approvedAt = now;
  }
  if (status === "REJECTED" && !existing?.rejectedAt) {
    data.rejectedAt = now;
  }
  if (status === "REFUNDED" && !existing?.refundedAt) {
    data.refundedAt = now;
  }
  if (status === "CANCELLED" && !existing?.cancelledAt) {
    data.cancelledAt = now;
  }
  return data;
}

function refundEventForStatus(status: RefundStatus): StoreNotificationEvent {
  if (status === "APPROVED") return "REFUND_APPROVED";
  if (status === "REJECTED") return "REFUND_REJECTED";
  if (status === "REFUNDED") return "REFUND_REFUNDED";
  if (status === "CANCELLED") return "REFUND_CANCELLED";
  return "REFUND_REQUESTED";
}

function cleanMidtransRefundKey(value: string) {
  return (
    value
      .replace(/[^A-Za-z0-9_-]/g, "_")
      .slice(0, 64) || `refund_${Date.now()}`
  );
}

function isKnownNonRefundableTransactionStatus(
  status: string | null | undefined
) {
  return status === "pending" || status === "authorize" || status === "capture";
}

function midtransRefundAccepted(payload: MidtransRefundResult) {
  const statusCode = stringFromUnknown(payload.status_code);
  const transactionStatus = stringFromUnknown(payload.transaction_status);
  return (
    statusCode === "200" ||
    statusCode === "201" ||
    transactionStatus === "refund" ||
    transactionStatus === "partial_refund"
  );
}

function midtransProviderStatus(payload: MidtransRefundResult) {
  return (
    stringFromUnknown(payload.transaction_status) ??
    stringFromUnknown(payload.status_code)
  );
}

function midtransProviderReference(
  payload: MidtransRefundResult,
  fallback: string
) {
  return (
    stringFromUnknown(payload.refund_chargeback_id) ??
    stringFromUnknown(payload.refund_key) ??
    fallback
  );
}

function midtransStatusMessage(payload: MidtransRefundResult) {
  return stringFromUnknown(payload.status_message);
}

async function recordProviderAttempt(
  refundId: string,
  input: {
    providerRefundKey: string;
    providerStatus: string;
    providerReference: string;
    providerResponse: Prisma.InputJsonValue;
    providerRequestedAt: Date;
  }
) {
  await prisma.orderRefund.update({
    where: { id: refundId },
    data: {
      provider: "midtrans",
      providerRefundKey: input.providerRefundKey,
      providerStatus: input.providerStatus,
      providerReference: input.providerReference,
      providerResponse: input.providerResponse,
      providerRequestedAt: input.providerRequestedAt,
    },
  });
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

function normalizeQuantity(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function handleRefundError(error: unknown): { ok: false; error: string } {
  if (error instanceof OrderRefundError) {
    return { ok: false, error: error.message };
  }
  reportError("order-refunds failed", error);
  return { ok: false, error: "Could not update refund data. Please retry." };
}

/**
 * GA4 revenue goes down when money goes back. Runs after the refund commits,
 * never inside its transaction; a duplicate call is dropped by the queue's
 * event id (`refund:<id>`).
 */
function reportRefundToAnalytics(workspaceId: string, refundId: string) {
  queueGa4Refund(workspaceId, refundId).catch((error) => {
    console.warn("GA4 refund queue failed", error);
  });
}
