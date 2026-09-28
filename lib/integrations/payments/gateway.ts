import "server-only";

import type { PaymentReconciliationResult, PaymentStatus, Prisma } from "@prisma/client";

import { reportError } from "@/lib/error-reporting";
import { applyPaymentStatus } from "@/lib/payments";
import { recordPaymentWebhookEvent } from "@/lib/payment-webhooks";
import { prisma } from "@/lib/prisma";

import { getConnection, recordInboundEvent, webhookUrlFor, type LoadedConnection } from "../connections";
import { asTestResult, ProviderError, providerFetch, type TestResult } from "../http";
import type { HttpRequest } from "../email/requests";
import {
  chargeCurrency,
  duitkuCreateInvoice,
  duitkuPaymentMethods,
  duitkuTransactionStatus,
  mapDuitkuStatus,
  mapPaypalOrder,
  mapStripeSession,
  mapXenditInvoice,
  paypalAmount,
  paypalApproveLink,
  paypalCaptureOrder,
  paypalCreateOrder,
  paypalGetOrder,
  paypalToken,
  stripeBalance,
  stripeCreateSession,
  stripeGetSession,
  toMinorUnits,
  verifyDuitkuCallback,
  verifyStripeSignature,
  xenditBalance,
  xenditCreateInvoice,
  xenditGetInvoice,
  type CheckoutInput,
  type GatewayStatus,
} from "./requests";

/**
 * Payment gateways connected through the integration catalog (Xendit, Stripe,
 * PayPal, Duitku). Midtrans keeps its own dedicated flow.
 *
 * Trust model: a webhook only says "look at payment X". The status is always
 * re-read from the provider's authenticated API with the workspace's own
 * credentials, and the charged amount is compared with what we asked for,
 * before anything is marked paid. A forged or replayed webhook can at most
 * trigger a harmless re-check.
 */

export const PAYMENT_GATEWAY_IDS = ["xendit", "stripe", "paypal", "duitku"] as const;
export type PaymentGatewayId = (typeof PAYMENT_GATEWAY_IDS)[number];

export function isPaymentGateway(provider: string | null | undefined): provider is PaymentGatewayId {
  return (PAYMENT_GATEWAY_IDS as readonly string[]).includes(provider ?? "");
}

type PaymentForGateway = {
  id: string;
  workspaceId: string;
  status: PaymentStatus;
  provider: string;
  amount: number;
  description: string | null;
  midtransOrderId: string;
  transactionId: string | null;
  expiresAt: Date | null;
  rawNotification: Prisma.JsonValue | null;
};

/** What we asked the provider to charge, kept so a later check can compare. */
type ChargeRecord = { currency: string; minor: number };

async function call<T = Record<string, unknown>>(connection: LoadedConnection, request: HttpRequest) {
  return providerFetch<T>(connection.provider.name, request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
}

async function storeCurrency(workspaceId: string) {
  const setting = await prisma.ecommerceSetting.findUnique({ where: { workspaceId }, select: { currencyCode: true } });
  return (setting?.currencyCode || "IDR").toUpperCase();
}

// PayPal access tokens last ~9 hours; one per connection is plenty.
const paypalTokens = new Map<string, { token: string; expiresAt: number; fingerprint: string }>();

async function paypalAccessToken(connection: LoadedConnection) {
  const fingerprint = `${connection.config.mode}:${connection.config.clientId}:${connection.secrets.clientSecret?.slice(-6)}`;
  const cached = paypalTokens.get(connection.id);
  if (cached && cached.fingerprint === fingerprint && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const response = await call<{ access_token?: string; expires_in?: number }>(
    connection,
    paypalToken(connection.config, connection.secrets)
  );
  if (!response.access_token) throw new ProviderError("PayPal did not return an access token.");
  paypalTokens.set(connection.id, {
    token: response.access_token,
    expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
    fingerprint,
  });
  return response.access_token;
}

function expectedCharge(connection: LoadedConnection, amount: number, currency: string): ChargeRecord {
  switch (connection.provider.id) {
    case "stripe": {
      const code = chargeCurrency(connection.config, currency);
      const rate = Number(connection.config.exchangeRate) > 0 ? Number(connection.config.exchangeRate) : 1;
      return { currency: code, minor: toMinorUnits(amount, code, rate) };
    }
    case "paypal": {
      const money = paypalAmount(connection.config, amount);
      return { currency: money.currency_code, minor: Math.round(Number(money.value) * 100) };
    }
    default:
      // Xendit and Duitku charge whole rupiah.
      return { currency: "IDR", minor: amount };
  }
}

function storedCharge(payment: PaymentForGateway): ChargeRecord | null {
  const raw = payment.rawNotification as { charge?: ChargeRecord } | null;
  const charge = raw && typeof raw === "object" ? raw.charge : null;
  return charge && typeof charge.minor === "number" && typeof charge.currency === "string" ? charge : null;
}

// ------------------------------------------------------------------ checkout

export type GatewayCheckoutUrls = {
  /** Our return endpoint: it re-checks the status, then shows the result. */
  returnUrl: string;
  cancelUrl: string;
};

/**
 * Creates the hosted checkout at the provider and stores its id and URL on the
 * payment. The caller has already checked the payment is PENDING.
 */
export async function startGatewayCheckout(
  connection: LoadedConnection,
  payment: PaymentForGateway,
  customer: CheckoutInput["customer"],
  urls: GatewayCheckoutUrls
): Promise<{ url: string }> {
  const currency = await storeCurrency(payment.workspaceId);
  if ((connection.provider.id === "xendit" || connection.provider.id === "duitku") && currency !== "IDR") {
    throw new ProviderError(`${connection.provider.name} only charges IDR, but this store prices in ${currency}.`);
  }
  const input: CheckoutInput = {
    reference: payment.midtransOrderId,
    amount: payment.amount,
    description: payment.description?.trim() || "Order",
    customer,
    returnUrl: urls.returnUrl,
    cancelUrl: urls.cancelUrl,
    callbackUrl: webhookUrlFor(connection.provider.id, connection.webhookKey),
    expiresAt: payment.expiresAt,
  };

  let url: string | null = null;
  let transactionId: string | null = null;
  switch (connection.provider.id) {
    case "xendit": {
      const invoice = await call(connection, xenditCreateInvoice(connection.secrets, input));
      url = typeof invoice.invoice_url === "string" ? invoice.invoice_url : null;
      transactionId = typeof invoice.id === "string" ? invoice.id : null;
      break;
    }
    case "stripe": {
      const session = await call(connection, stripeCreateSession(connection.config, connection.secrets, input, currency));
      url = typeof session.url === "string" ? session.url : null;
      transactionId = typeof session.id === "string" ? session.id : null;
      break;
    }
    case "paypal": {
      const token = await paypalAccessToken(connection);
      const order = await call(connection, paypalCreateOrder(connection.config, token, input));
      url = paypalApproveLink(order);
      transactionId = typeof order.id === "string" ? order.id : null;
      break;
    }
    case "duitku": {
      const invoice = await call(connection, duitkuCreateInvoice(connection.config, connection.secrets, input));
      if (invoice.statusCode && invoice.statusCode !== "00") {
        throw new ProviderError(`Duitku: ${String(invoice.statusMessage ?? invoice.statusCode)}`);
      }
      url = typeof invoice.paymentUrl === "string" ? invoice.paymentUrl : null;
      transactionId = typeof invoice.reference === "string" ? invoice.reference : null;
      break;
    }
    default:
      throw new ProviderError(`${connection.provider.name} cannot take payments.`);
  }
  if (!url || !transactionId) throw new ProviderError(`${connection.provider.name} did not return a checkout link.`);

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      provider: connection.provider.id,
      transactionId,
      transactionStatus: "created",
      snapToken: null,
      snapRedirectUrl: url,
      rawNotification: {
        source: "gateway_checkout",
        provider: connection.provider.id,
        charge: expectedCharge(connection, payment.amount, currency),
      },
    },
  });
  return { url };
}

// -------------------------------------------------------------------- status

async function fetchStatus(connection: LoadedConnection, payment: PaymentForGateway): Promise<{ status: GatewayStatus; raw: unknown }> {
  switch (connection.provider.id) {
    case "xendit": {
      if (!payment.transactionId) throw new ProviderError("No Xendit invoice id on this payment.", 404);
      const invoice = await call(connection, xenditGetInvoice(connection.secrets, payment.transactionId));
      return { status: mapXenditInvoice(invoice), raw: invoice };
    }
    case "stripe": {
      if (!payment.transactionId) throw new ProviderError("No Stripe session id on this payment.", 404);
      const session = await call(connection, stripeGetSession(connection.secrets, payment.transactionId));
      return { status: mapStripeSession(session), raw: session };
    }
    case "paypal": {
      if (!payment.transactionId) throw new ProviderError("No PayPal order id on this payment.", 404);
      const token = await paypalAccessToken(connection);
      let order = await call(connection, paypalGetOrder(connection.config, token, payment.transactionId));
      if (mapPaypalOrder(order).needsCapture) {
        // The buyer approved; money only moves once we capture.
        order = await call(connection, paypalCaptureOrder(connection.config, token, payment.transactionId, payment.midtransOrderId));
      }
      return { status: mapPaypalOrder(order), raw: order };
    }
    case "duitku": {
      const result = await call(connection, duitkuTransactionStatus(connection.config, connection.secrets, payment.midtransOrderId));
      return { status: mapDuitkuStatus(result), raw: result };
    }
    default:
      throw new ProviderError(`${connection.provider.name} has no payment status API.`);
  }
}

export type GatewaySyncOutcome = {
  status: PaymentStatus;
  changed: boolean;
  providerStatus: string;
  error?: string;
};

/**
 * Reads the payment's real status from the provider and applies it. A paid
 * status whose amount does not match what we asked for is refused and
 * reported: that is either misconfiguration or tampering, never a sale.
 */
export async function syncGatewayPayment(
  connection: LoadedConnection,
  payment: PaymentForGateway,
  source: "webhook" | "return" | "reconcile"
): Promise<GatewaySyncOutcome> {
  const { status: remote, raw } = await fetchStatus(connection, payment);
  const charge = storedCharge(payment);
  if (remote.status === "PAID" && charge && remote.chargedMinor !== null && remote.chargedMinor < charge.minor) {
    const error = `${connection.provider.name} reports ${remote.chargedMinor} charged but ${charge.minor} ${charge.currency} was expected. Not marked as paid.`;
    reportError("payment gateway amount mismatch", new Error(error), {
      context: { paymentId: payment.id, provider: connection.provider.id },
    });
    return { status: "PENDING", changed: false, providerStatus: remote.providerStatus, error };
  }

  const result = await applyPaymentStatus(payment.id, remote.status, {
    transactionId: remote.transactionId ?? payment.transactionId,
    transactionStatus: remote.providerStatus.slice(0, 100),
    paymentType: remote.paymentType?.slice(0, 100) ?? null,
    rawNotification: {
      source: `gateway_${source}`,
      provider: connection.provider.id,
      checkedAt: new Date().toISOString(),
      ...(charge ? { charge } : {}),
      response: JSON.parse(JSON.stringify(raw ?? null)),
    } as Prisma.InputJsonValue,
  });
  return { status: result.payment.status, changed: result.changed, providerStatus: remote.providerStatus };
}

const paymentSelect = {
  id: true,
  workspaceId: true,
  status: true,
  provider: true,
  amount: true,
  description: true,
  midtransOrderId: true,
  transactionId: true,
  expiresAt: true,
  rawNotification: true,
} as const;

export async function findGatewayPayment(where: Prisma.PaymentWhereInput) {
  return prisma.payment.findFirst({ where, select: paymentSelect });
}

// ------------------------------------------------------------------- webhook

export type WebhookResponse = { status: number; body: Record<string, unknown> };

function parseJson(rawBody: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(rawBody);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** Pulls our payment reference out of a verified-or-not notification. */
function readNotification(
  connection: LoadedConnection,
  rawBody: string,
  headers: Headers
): { ok: true; reference: string | null; payload: unknown } | { ok: false; status: number; error: string; payload?: unknown } {
  switch (connection.provider.id) {
    case "xendit": {
      const token = headers.get("x-callback-token") ?? "";
      if (!token || token !== connection.secrets.callbackToken) {
        return { ok: false, status: 401, error: "Callback token mismatch." };
      }
      const body = parseJson(rawBody);
      if (!body) return { ok: false, status: 400, error: "Invalid JSON body." };
      return { ok: true, reference: typeof body.external_id === "string" ? body.external_id : null, payload: body };
    }
    case "stripe": {
      if (!verifyStripeSignature(rawBody, headers.get("stripe-signature"), connection.secrets.webhookSecret ?? "")) {
        return { ok: false, status: 400, error: "Stripe signature mismatch." };
      }
      const event = parseJson(rawBody);
      if (!event) return { ok: false, status: 400, error: "Invalid JSON body." };
      const type = String(event.type ?? "");
      const object = ((event.data as { object?: Record<string, unknown> } | undefined)?.object ?? {}) as Record<string, unknown>;
      const reference = type.startsWith("checkout.session.") && typeof object.client_reference_id === "string" ? object.client_reference_id : null;
      return { ok: true, reference, payload: { id: event.id, type, session: object.id } };
    }
    case "paypal": {
      // Not verified here: PayPal's verification needs a round trip, and the
      // status is re-read with our own credentials before anything changes.
      const event = parseJson(rawBody);
      if (!event) return { ok: false, status: 400, error: "Invalid JSON body." };
      const resource = (event.resource ?? {}) as Record<string, unknown>;
      const unit = Array.isArray(resource.purchase_units) ? (resource.purchase_units[0] as Record<string, unknown>) : null;
      const candidates = [unit?.custom_id, unit?.reference_id, resource.custom_id, resource.invoice_id];
      const reference = candidates.find((value): value is string => typeof value === "string" && value.length > 0) ?? null;
      return { ok: true, reference, payload: { id: event.id, event_type: event.event_type, resource_id: resource.id } };
    }
    case "duitku": {
      const fields = rawBody.trim().startsWith("{")
        ? Object.fromEntries(Object.entries(parseJson(rawBody) ?? {}).map(([key, value]) => [key, String(value ?? "")]))
        : Object.fromEntries(new URLSearchParams(rawBody));
      if (!verifyDuitkuCallback(fields, connection.config, connection.secrets)) {
        return { ok: false, status: 401, error: "Duitku signature mismatch.", payload: { merchantOrderId: fields.merchantOrderId } };
      }
      const { signature: _signature, ...safe } = fields;
      void _signature;
      return { ok: true, reference: fields.merchantOrderId || null, payload: safe };
    }
    default:
      return { ok: false, status: 404, error: "Not a payment provider." };
  }
}

export async function handlePaymentWebhook(connection: LoadedConnection, rawBody: string, headers: Headers): Promise<WebhookResponse> {
  const provider = connection.provider.id;
  const notification = readNotification(connection, rawBody, headers);
  if (!notification.ok) {
    await recordPaymentWebhookEvent({
      provider,
      workspaceId: connection.workspaceId,
      result: notification.status === 400 && notification.error.startsWith("Invalid") ? "INVALID_BODY" : "BAD_SIGNATURE",
      signatureValid: false,
      error: notification.error,
      payload: (notification.payload ?? null) as Prisma.InputJsonValue | null,
    });
    await recordInboundEvent(connection.id, `Rejected a webhook: ${notification.error}`).catch(() => {});
    return { status: notification.status, body: { error: notification.error } };
  }

  if (!notification.reference) {
    // Events we do not act on (a PayPal dispute, a Stripe payout) still count
    // as proof the webhook is wired up.
    await recordInboundEvent(connection.id).catch(() => {});
    return { status: 200, body: { received: true, ignored: true } };
  }

  const payment = await findGatewayPayment({
    midtransOrderId: notification.reference,
    workspaceId: connection.workspaceId,
    provider,
  });
  if (!payment) {
    await recordPaymentWebhookEvent({
      provider,
      workspaceId: connection.workspaceId,
      result: "UNKNOWN_PAYMENT",
      signatureValid: provider === "paypal" ? null : true,
      midtransOrderId: notification.reference,
      payload: notification.payload as Prisma.InputJsonValue,
    });
    return { status: 200, body: { received: true } };
  }

  try {
    const outcome = await syncGatewayPayment(connection, payment, "webhook");
    await recordPaymentWebhookEvent({
      provider,
      workspaceId: payment.workspaceId,
      paymentId: payment.id,
      result: outcome.error ? "PROCESSING_FAILED" : "PROCESSED",
      signatureValid: provider === "paypal" ? null : true,
      midtransOrderId: payment.midtransOrderId,
      mappedStatus: outcome.status,
      transactionStatus: outcome.providerStatus,
      transactionId: payment.transactionId,
      changedPayment: outcome.changed,
      error: outcome.error ?? null,
      payload: notification.payload as Prisma.InputJsonValue,
    });
    await recordInboundEvent(connection.id, outcome.error).catch(() => {});
    return { status: 200, body: { received: true } };
  } catch (error) {
    reportError(`${provider} webhook processing failed`, error);
    await recordPaymentWebhookEvent({
      provider,
      workspaceId: payment.workspaceId,
      paymentId: payment.id,
      result: "PROCESSING_FAILED",
      signatureValid: provider === "paypal" ? null : true,
      midtransOrderId: payment.midtransOrderId,
      error: error instanceof Error ? error.message : "Processing failed.",
      payload: notification.payload as Prisma.InputJsonValue,
    });
    // Non-2xx so the provider redelivers once we can reach its API again.
    return { status: 500, body: { error: "Processing failed" } };
  }
}

// ------------------------------------------------------------ reconciliation

async function reconcileOne(payment: PaymentForGateway, now: Date): Promise<PaymentReconciliationResult | "UNCONFIGURED"> {
  const connection = await getConnection(payment.workspaceId, payment.provider);
  if (!connection) return "UNCONFIGURED";
  let result: PaymentReconciliationResult;
  let error: string | null = null;
  let outcome: GatewaySyncOutcome | null = null;
  try {
    outcome = await syncGatewayPayment(connection, payment, "reconcile");
    error = outcome.error ?? null;
    result = error ? "FAILED" : outcome.changed && outcome.status !== "PENDING" ? "SYNCED" : "UNCHANGED";
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Sync failed.";
    result = caught instanceof ProviderError && caught.status === 404 ? "NOT_FOUND" : "FAILED";
  }
  await prisma.paymentReconciliationEvent
    .create({
      data: {
        provider: payment.provider,
        workspaceId: payment.workspaceId,
        paymentId: payment.id,
        result,
        midtransOrderId: payment.midtransOrderId,
        previousStatus: payment.status,
        mappedStatus: outcome?.status ?? null,
        transactionStatus: outcome?.providerStatus.slice(0, 100) ?? null,
        transactionId: payment.transactionId,
        changedPayment: outcome?.changed ?? null,
        error: error?.slice(0, 1000) ?? null,
        checkedAt: now,
      },
    })
    .catch((logError) => console.warn("[payments] failed to record gateway reconciliation:", logError));
  return result;
}

/** The periodic sweep: re-checks gateway payments whose webhook may have been missed. */
export async function reconcilePendingGatewayPayments(options: { limit?: number; now?: Date; minAgeMinutes?: number } = {}) {
  const now = options.now ?? new Date();
  const createdBefore = new Date(now.getTime() - (options.minAgeMinutes ?? 2) * 60_000);
  const payments = await prisma.payment.findMany({
    where: {
      status: "PENDING",
      provider: { in: [...PAYMENT_GATEWAY_IDS] },
      transactionId: { not: null },
      createdAt: { lte: createdBefore },
    },
    orderBy: { updatedAt: "asc" },
    take: Math.min(Math.max(options.limit ?? 50, 1), 200),
    select: paymentSelect,
  });
  const summary = { scanned: payments.length, synced: 0, unchanged: 0, notFound: 0, failed: 0, skipped: 0 };
  for (const payment of payments) {
    const outcome = await reconcileOne(payment, now);
    if (outcome === "UNCONFIGURED") summary.skipped += 1;
    else if (outcome === "SYNCED") summary.synced += 1;
    else if (outcome === "UNCHANGED") summary.unchanged += 1;
    else if (outcome === "NOT_FOUND") summary.notFound += 1;
    else summary.failed += 1;
  }
  return summary;
}

/** "Sync now" from the payment audit screen. */
export async function reconcileGatewayPayment(paymentId: string, workspaceId: string) {
  const payment = await findGatewayPayment({ id: paymentId, workspaceId, provider: { in: [...PAYMENT_GATEWAY_IDS] } });
  if (!payment) return { ok: false as const, error: "Payment tidak ditemukan." };
  if (payment.status !== "PENDING") return { ok: false as const, error: "Payment ini sudah final." };
  const result = await reconcileOne(payment, new Date());
  if (result === "UNCONFIGURED") return { ok: false as const, error: "Koneksi payment gateway sudah dihapus." };
  if (result === "FAILED") return { ok: false as const, error: "Sync ke payment gateway gagal. Coba lagi." };
  return { ok: true as const, result };
}

// ---------------------------------------------------------------------- test

export async function testPaymentConnection(connection: LoadedConnection): Promise<TestResult> {
  return asTestResult(async () => {
    switch (connection.provider.id) {
      case "xendit": {
        const balance = await call<{ balance?: number }>(connection, xenditBalance(connection.secrets));
        return `Connected. Cash balance: ${balance.balance ?? "?"}.`;
      }
      case "stripe": {
        const balance = await call<{ livemode?: boolean }>(connection, stripeBalance(connection.secrets));
        return `Connected in ${balance.livemode ? "live" : "test"} mode.`;
      }
      case "paypal":
        await paypalAccessToken(connection);
        return `Connected to PayPal ${connection.config.mode === "production" ? "live" : "sandbox"}.`;
      case "duitku": {
        const methods = await call<{ responseCode?: string; responseMessage?: string; paymentFee?: unknown[] }>(
          connection,
          duitkuPaymentMethods(connection.config, connection.secrets)
        );
        if (methods.responseCode && methods.responseCode !== "00") throw new Error(`Duitku: ${methods.responseMessage ?? methods.responseCode}`);
        return `Connected. ${methods.paymentFee?.length ?? 0} payment methods available.`;
      }
      default:
        throw new Error(`${connection.provider.name} cannot be tested yet.`);
    }
  });
}
