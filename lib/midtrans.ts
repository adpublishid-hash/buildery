import "server-only";

import { createHash } from "node:crypto";
import type { PaymentStatus } from "@prisma/client";

const SERVER_KEY = process.env.MIDTRANS_SERVER_KEY ?? "";
const CLIENT_KEY = process.env.MIDTRANS_CLIENT_KEY ?? "";
const IS_PRODUCTION = process.env.MIDTRANS_IS_PRODUCTION === "true";

/**
 * A workspace's own Midtrans credentials.
 *
 * Each store settles into its own merchant account, so the keys belong to the
 * workspace rather than the deployment. The env vars remain as a fallback for
 * single-tenant installs and for workspaces that have not filled theirs in.
 */
export type MidtransConfig = {
  enabled?: boolean;
  serverKey?: string | null;
  clientKey?: string | null;
  isProduction?: boolean | null;
};

export function resolveMidtransConfig(config?: MidtransConfig | null) {
  const enabled = config ? config.enabled !== false : true;
  const serverKey = enabled ? config?.serverKey?.trim() || SERVER_KEY : "";
  const clientKey = enabled ? config?.clientKey?.trim() || CLIENT_KEY : "";
  const isProduction = config?.isProduction ?? IS_PRODUCTION;
  return { serverKey, clientKey, isProduction };
}

function snapBase(isProduction: boolean) {
  return isProduction
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";
}

function apiBase(isProduction: boolean) {
  return isProduction
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";
}
const MIDTRANS_API_TIMEOUT_MS = 8000;

/** True when real Midtrans credentials are configured. */
export function isMidtransConfigured(config?: MidtransConfig | null) {
  const resolved = resolveMidtransConfig(config);
  return resolved.serverKey.length > 0 && resolved.clientKey.length > 0;
}

export function midtransClientKey(config?: MidtransConfig | null) {
  return resolveMidtransConfig(config).clientKey;
}

export type SnapCustomer = {
  firstName: string;
  email: string;
  phone?: string | null;
};

export type SnapTransactionInput = {
  orderId: string; // our midtransOrderId
  grossAmount: number; // whole rupiah
  itemName: string;
  customer: SnapCustomer;
  finishUrl: string;
};

export type SnapTransactionResult = {
  token: string;
  redirectUrl: string;
};

/**
 * Creates a Snap transaction via the Midtrans API and returns the
 * redirect URL the customer should be sent to. Throws on failure.
 */
export async function createSnapTransaction(
  input: SnapTransactionInput,
  config?: MidtransConfig | null
): Promise<SnapTransactionResult> {
  if (!isMidtransConfigured(config)) {
    throw new Error("Midtrans is not configured.");
  }

  const resolved = resolveMidtransConfig(config);
  const auth = Buffer.from(`${resolved.serverKey}:`).toString("base64");
  const body = {
    transaction_details: {
      order_id: input.orderId,
      gross_amount: input.grossAmount,
    },
    item_details: [
      {
        id: input.orderId,
        name: input.itemName.slice(0, 50),
        price: input.grossAmount,
        quantity: 1,
      },
    ],
    customer_details: {
      first_name: input.customer.firstName.slice(0, 50),
      email: input.customer.email,
      phone: input.customer.phone || undefined,
    },
    callbacks: { finish: input.finishUrl },
    credit_card: { secure: true },
  };

  const res = await fetch(`${snapBase(resolved.isProduction)}/snap/v1/transactions`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as {
    token?: string;
    redirect_url?: string;
    error_messages?: string[];
  };

  if (!res.ok || !json.token || !json.redirect_url) {
    const message =
      json.error_messages?.join("; ") ?? `Midtrans error (${res.status})`;
    throw new Error(message);
  }

  return { token: json.token, redirectUrl: json.redirect_url };
}

export type MidtransNotification = {
  order_id?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
  transaction_status?: string;
  fraud_status?: string;
  transaction_id?: string;
  payment_type?: string;
  [key: string]: unknown;
};

export type MidtransTransactionStatus = MidtransNotification & {
  status_message?: string;
  merchant_id?: string;
};

export type MidtransRefundInput = {
  transactionRef: string;
  refundKey: string;
  amount?: number;
  reason?: string | null;
  direct?: boolean;
};

export type MidtransRefundResult = {
  status_code?: string;
  status_message?: string;
  transaction_id?: string;
  order_id?: string;
  gross_amount?: string;
  payment_type?: string;
  transaction_status?: string;
  refund_chargeback_id?: string | number;
  refund_amount?: string;
  refund_key?: string;
  [key: string]: unknown;
};

export type MidtransCancelResult = {
  status_code?: string;
  status_message?: string;
  transaction_id?: string;
  order_id?: string;
  gross_amount?: string;
  payment_type?: string;
  transaction_status?: string;
  fraud_status?: string;
  transaction_time?: string;
  [key: string]: unknown;
};

export class MidtransApiError extends Error {
  status: number | null;
  payload: unknown;

  constructor(message: string, options: { status?: number; payload?: unknown } = {}) {
    super(message);
    this.name = "MidtransApiError";
    this.status = options.status ?? null;
    this.payload = options.payload ?? null;
  }
}

export async function fetchMidtransTransactionStatus(
  orderId: string,
  config?: MidtransConfig | null
): Promise<MidtransTransactionStatus> {
  if (!isMidtransConfigured(config)) {
    throw new MidtransApiError("Midtrans is not configured.");
  }

  const cleanOrderId = orderId.trim();
  if (!cleanOrderId) {
    throw new MidtransApiError("Midtrans order id is required.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MIDTRANS_API_TIMEOUT_MS);

  try {
    const res = await fetch(
      `${apiBase(resolveMidtransConfig(config).isProduction)}/v2/${encodeURIComponent(cleanOrderId)}/status`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${midtransServerAuth(config)}`,
        },
        signal: controller.signal,
      }
    );
    const payload = await readMidtransJson(res);
    if (!res.ok) {
      throw new MidtransApiError(midtransErrorMessage(payload, res.status), {
        status: res.status,
        payload,
      });
    }
    return payload as MidtransTransactionStatus;
  } catch (error) {
    if (error instanceof MidtransApiError) throw error;
    throw new MidtransApiError(
      error instanceof Error
        ? error.message.slice(0, 500)
        : "Midtrans status request failed."
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function requestMidtransRefund(
  input: MidtransRefundInput,
  config?: MidtransConfig | null
): Promise<MidtransRefundResult> {
  if (!isMidtransConfigured(config)) {
    throw new MidtransApiError("Midtrans is not configured.");
  }

  const transactionRef = input.transactionRef.trim();
  const refundKey = input.refundKey.trim();
  if (!transactionRef) {
    throw new MidtransApiError("Midtrans transaction reference is required.");
  }
  if (!refundKey) {
    throw new MidtransApiError("Midtrans refund key is required.");
  }

  const body = {
    refund_key: refundKey,
    amount:
      input.amount != null && input.amount > 0
        ? Math.floor(input.amount)
        : undefined,
    reason: input.reason?.trim().slice(0, 255) || undefined,
  };
  const path = input.direct ? "refund/online/direct" : "refund";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MIDTRANS_API_TIMEOUT_MS);

  try {
    const res = await fetch(
      `${apiBase(resolveMidtransConfig(config).isProduction)}/v2/${encodeURIComponent(transactionRef)}/${path}`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Basic ${midtransServerAuth(config)}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );
    const payload = await readMidtransJson(res);
    if (!res.ok) {
      throw new MidtransApiError(midtransErrorMessage(payload, res.status), {
        status: res.status,
        payload,
      });
    }
    return payload as MidtransRefundResult;
  } catch (error) {
    if (error instanceof MidtransApiError) throw error;
    throw new MidtransApiError(
      error instanceof Error
        ? error.message.slice(0, 500)
        : "Midtrans refund request failed."
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function requestMidtransCancel(
  transactionRef: string,
  config?: MidtransConfig | null
): Promise<MidtransCancelResult> {
  if (!isMidtransConfigured(config)) {
    throw new MidtransApiError("Midtrans is not configured.");
  }

  const cleanRef = transactionRef.trim();
  if (!cleanRef) {
    throw new MidtransApiError("Midtrans transaction reference is required.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MIDTRANS_API_TIMEOUT_MS);

  try {
    const res = await fetch(
      `${apiBase(resolveMidtransConfig(config).isProduction)}/v2/${encodeURIComponent(cleanRef)}/cancel`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Basic ${midtransServerAuth(config)}`,
        },
        signal: controller.signal,
      }
    );
    const payload = await readMidtransJson(res);
    if (!res.ok) {
      throw new MidtransApiError(midtransErrorMessage(payload, res.status), {
        status: res.status,
        payload,
      });
    }
    return payload as MidtransCancelResult;
  } catch (error) {
    if (error instanceof MidtransApiError) throw error;
    throw new MidtransApiError(
      error instanceof Error
        ? error.message.slice(0, 500)
        : "Midtrans cancel request failed."
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verifies a webhook payload's signature:
 * sha512(order_id + status_code + gross_amount + ServerKey).
 */
export function verifyMidtransSignature(
  notification: MidtransNotification,
  config?: MidtransConfig | null
): boolean {
  const { order_id, status_code, gross_amount, signature_key } = notification;
  if (!order_id || !status_code || !gross_amount || !signature_key) {
    return false;
  }
  const expected = createHash("sha512")
    .update(
      `${order_id}${status_code}${gross_amount}${resolveMidtransConfig(config).serverKey}`
    )
    .digest("hex");
  return expected === signature_key;
}

/**
 * Maps Midtrans transaction_status (+ fraud_status) to our PaymentStatus.
 */
export function mapMidtransStatus(
  transactionStatus: string | undefined,
  fraudStatus: string | undefined
): PaymentStatus {
  switch (transactionStatus) {
    case "capture":
      return fraudStatus === "challenge" ? "PENDING" : "PAID";
    case "settlement":
      return "PAID";
    case "pending":
      return "PENDING";
    case "deny":
    case "failure":
      return "FAILED";
    case "cancel":
      return "CANCELLED";
    case "expire":
      return "EXPIRED";
    default:
      return "PENDING";
  }
}

function midtransServerAuth(config?: MidtransConfig | null) {
  return Buffer.from(
    `${resolveMidtransConfig(config).serverKey}:`
  ).toString("base64");
}

async function readMidtransJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const json = await res.json();
    return json && typeof json === "object" && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function midtransErrorMessage(payload: Record<string, unknown>, status: number) {
  const messages = payload.error_messages;
  if (Array.isArray(messages) && messages.length > 0) {
    return messages.map(String).join("; ").slice(0, 500);
  }
  if (typeof payload.status_message === "string" && payload.status_message) {
    return payload.status_message.slice(0, 500);
  }
  return `Midtrans status API returned HTTP ${status}`;
}
