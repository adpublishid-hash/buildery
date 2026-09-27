import "server-only";

import type { RefundStatus } from "@prisma/client";

import {
  createOrderRefund,
  type OrderRefundEvidenceInput,
  type OrderRefundItemInput,
} from "@/lib/order-refunds";
import { prisma } from "@/lib/prisma";
import {
  MAX_RETURN_NOTE_LENGTH,
  MAX_RETURN_REASON_LENGTH,
} from "@/lib/public-return-limits";
import { verifyPublicAccessToken } from "@/lib/public-access-token";
import { rateLimitByIp } from "@/lib/rate-limit";
import {
  ALLOWED_EVIDENCE_TYPES,
  MAX_EVIDENCE_FILES,
  MAX_UPLOAD_BYTES,
} from "@/lib/upload-constants";

/**
 * Customer-facing refund/return intake.
 *
 * This is the only refund path that is reachable without a dashboard login —
 * the order's signed `access` token is the whole authorisation — so it gets
 * its own guards: an IP budget, a per-order budget, bounded free text, and a
 * duplicate check. The dashboard actions in `lib/actions/order.ts` stay
 * unguarded because a staff session already gates them.
 */

/** Per-IP budget. Generous enough for a customer who mistypes a few times. */
export const RETURN_REQUEST_IP_LIMIT = 5;
/**
 * Per-order budget, keyed on the order rather than the caller. Without
 * `TRUST_PROXY` every client reports as "unknown" and shares one IP bucket,
 * so this is what actually stops one order being spammed.
 */
export const RETURN_REQUEST_ORDER_LIMIT = 3;
export const RETURN_REQUEST_WINDOW_MS = 10 * 60 * 1000;

export { MAX_RETURN_NOTE_LENGTH, MAX_RETURN_REASON_LENGTH };

/** Requests still awaiting a decision — a second identical one adds nothing. */
const OPEN_REFUND_STATUSES: RefundStatus[] = ["REQUESTED", "APPROVED"];

const REQUESTABLE_ORDER_STATUSES = ["PAID", "PROCESSING", "COMPLETED"];

type ServiceResult<T> = ({ ok: true } & T) | { ok: false; error: string };

export type PublicReturnRequestInput = {
  workspaceSlug: string;
  orderNumber: string;
  accessToken?: string;
  amount: number;
  reason?: string | null;
  note?: string | null;
  items: OrderRefundItemInput[];
  evidence?: OrderRefundEvidenceInput[];
};

export async function submitPublicReturnRequest(
  input: PublicReturnRequestInput
): Promise<
  ServiceResult<{ workspaceId: string; orderId: string; refundId: string }>
> {
  const ipLimit = await rateLimitByIp(
    "order-return-request",
    RETURN_REQUEST_IP_LIMIT,
    RETURN_REQUEST_WINDOW_MS
  );
  if (!ipLimit.ok) return tooManyRequests(ipLimit.retryAfter);

  const workspace = await prisma.workspace.findUnique({
    where: { slug: input.workspaceSlug },
    select: { id: true, slug: true },
  });
  // Same message as a bad token below: a wrong slug must not confirm which
  // stores exist.
  if (!workspace) return { ok: false, error: INVALID_LINK_ERROR };

  const order = await prisma.order.findUnique({
    where: {
      workspaceId_orderNumber: {
        workspaceId: workspace.id,
        orderNumber: input.orderNumber,
      },
    },
    select: { id: true, status: true },
  });
  if (!order || !verifyPublicAccessToken(input.accessToken, "order", order.id)) {
    return { ok: false, error: INVALID_LINK_ERROR };
  }

  if (!REQUESTABLE_ORDER_STATUSES.includes(order.status)) {
    return {
      ok: false,
      error:
        "Return/refund request is only available after payment is confirmed.",
    };
  }

  // Only now that the token has proven the caller owns this order — an
  // unauthenticated scan must not be able to burn another order's budget.
  const orderLimit = await rateLimitByIp(
    `order-return-request:${order.id}`,
    RETURN_REQUEST_ORDER_LIMIT,
    RETURN_REQUEST_WINDOW_MS
  );
  if (!orderLimit.ok) return tooManyRequests(orderLimit.retryAfter);

  const reason = boundedText(input.reason, MAX_RETURN_REASON_LENGTH);
  if (!reason.ok) {
    return {
      ok: false,
      error: `Reason must be ${MAX_RETURN_REASON_LENGTH} characters or fewer.`,
    };
  }
  const note = boundedText(input.note, MAX_RETURN_NOTE_LENGTH);
  if (!note.ok) {
    return {
      ok: false,
      error: `Note must be ${MAX_RETURN_NOTE_LENGTH} characters or fewer.`,
    };
  }

  const amount = Math.floor(input.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: "Refund amount must be zero or greater." };
  }

  const duplicate = await findDuplicateRequest(order.id, amount, input.items);
  if (duplicate) {
    return {
      ok: false,
      error:
        "A request with the same items and amount is already being reviewed.",
    };
  }

  const evidence = validateEvidence(input.evidence ?? [], workspace.id);
  if (!evidence.ok) return evidence;

  const returnToStock = input.items.some(
    (item) => (item.restockQuantity ?? 0) > 0
  );
  const result = await createOrderRefund(order.id, {
    workspaceId: workspace.id,
    type: returnToStock ? "RETURN" : "REFUND",
    status: "REQUESTED",
    amount,
    reason: reason.value ?? "Customer return request",
    note: note.value,
    returnToStock,
    items: input.items,
    evidence: evidence.value,
    notify: true,
  });
  if (!result.ok) return result;

  return {
    ok: true,
    workspaceId: workspace.id,
    orderId: order.id,
    refundId: result.refundId,
  };
}

const INVALID_LINK_ERROR = "Order link is invalid or expired.";

function tooManyRequests(retryAfter: number): { ok: false; error: string } {
  const minutes = Math.max(1, Math.ceil(retryAfter / 60));
  return {
    ok: false,
    error: `Too many return requests. Please try again in about ${minutes} minute${
      minutes === 1 ? "" : "s"
    }.`,
  };
}

/**
 * A customer double-tapping submit, or re-opening a stale tab, must not
 * create two identical open requests. Matching on amount plus the exact item
 * quantities keeps a genuinely different follow-up request possible.
 */
async function findDuplicateRequest(
  orderId: string,
  amount: number,
  items: OrderRefundItemInput[]
) {
  const open = await prisma.orderRefund.findMany({
    where: { orderId, status: { in: OPEN_REFUND_STATUSES } },
    select: {
      id: true,
      amount: true,
      items: {
        select: { orderItemId: true, quantity: true, restockQuantity: true },
      },
    },
  });
  const signature = refundSignature(items);
  return open.find(
    (refund) =>
      refund.amount === amount && refundSignature(refund.items) === signature
  );
}

function refundSignature(
  items: {
    orderItemId: string;
    quantity: number;
    restockQuantity?: number | null;
  }[]
) {
  return items
    .map(
      (item) =>
        `${item.orderItemId}:${Math.max(0, item.quantity)}:${Math.max(
          0,
          item.restockQuantity ?? 0
        )}`
    )
    .sort()
    .join("|");
}

/**
 * Evidence metadata arrives from the browser, so none of it can be trusted:
 * the URL is re-derived rather than believed. Only a path the evidence
 * upload route could have produced for *this* workspace is accepted, which
 * stops a caller pointing a refund at someone else's upload — or at any
 * other file on the site.
 */
function validateEvidence(
  files: OrderRefundEvidenceInput[],
  workspaceId: string
): { ok: true; value: OrderRefundEvidenceInput[] } | { ok: false; error: string } {
  if (files.length === 0) return { ok: true, value: [] };
  if (files.length > MAX_EVIDENCE_FILES) {
    return {
      ok: false,
      error: `Maksimal ${MAX_EVIDENCE_FILES} file bukti per request.`,
    };
  }

  const prefix = `/uploads/${workspaceId}/return-evidence/`;
  const seen = new Set<string>();
  const value: OrderRefundEvidenceInput[] = [];

  for (const file of files) {
    const url = String(file?.url ?? "");
    if (!url.startsWith(prefix) || url.includes("..")) {
      return { ok: false, error: "Bukti tidak valid. Upload ulang filenya." };
    }
    if (seen.has(url)) continue;
    seen.add(url);

    if (!ALLOWED_EVIDENCE_TYPES.includes(file.mimeType)) {
      return { ok: false, error: "Gunakan file PNG, JPG, WEBP, atau PDF." };
    }
    const size = Math.floor(Number(file.size));
    if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
      return { ok: false, error: "Ukuran file bukti maksimal 5 MB." };
    }

    value.push({
      url,
      name: String(file.name ?? "").trim().slice(0, 200) || "bukti",
      mimeType: file.mimeType,
      size,
    });
  }

  return { ok: true, value };
}

/**
 * Rejects over-long free text rather than truncating it: silently cutting a
 * customer's explanation in half loses the detail the seller needs.
 */
function boundedText(
  value: string | null | undefined,
  max: number
): { ok: true; value: string | null } | { ok: false } {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length > max) return { ok: false };
  return { ok: true, value: trimmed || null };
}
