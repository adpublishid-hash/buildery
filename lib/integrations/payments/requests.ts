// Pure request builders, status mappers, and signature checks for the payment
// gateways. No network and no server-only imports, so every provider rule can
// be unit-tested; `gateway.ts` does the fetching.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { PaymentStatus } from "@prisma/client";

import type { HttpRequest } from "../email/requests";

type Cfg = Record<string, string>;

export type CheckoutInput = {
  /** Our payment reference (Payment.midtransOrderId), unique across the app. */
  reference: string;
  /** Whole units of the store currency. */
  amount: number;
  description: string;
  customer: { name: string; email: string | null; phone: string | null };
  /** Where the buyer lands after paying; it reconciles and forwards. */
  returnUrl: string;
  cancelUrl: string;
  /** Server-to-server notification URL, for providers that take it per request. */
  callbackUrl: string;
  expiresAt: Date | null;
  now?: Date;
};

export type GatewayStatus = {
  status: PaymentStatus;
  /** Provider's own status word, kept for the payment audit screen. */
  providerStatus: string;
  transactionId: string | null;
  paymentType: string | null;
  /** Amount the provider says was charged, in the units we asked for. */
  chargedMinor: number | null;
};

// ------------------------------------------------------------------ shared

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validEmail(value: string | null | undefined) {
  const email = value?.trim() ?? "";
  return EMAIL_RE.test(email) ? email : null;
}

/** E.164 for providers that validate phone numbers strictly. */
export function e164(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `+${digits.startsWith("0") ? `62${digits.slice(1)}` : digits}`;
}

function secondsUntil(expiresAt: Date | null, now: Date) {
  if (!expiresAt) return null;
  return Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
}

const md5 = (value: string) => createHash("md5").update(value, "utf8").digest("hex");
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

function safeEqualHex(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Stripe and PayPal charge in minor units of a currency that may differ from
// the store's. Everything else here is IDR, charged as-is.
const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);
const PAYPAL_NO_DECIMAL = new Set(["HUF", "JPY", "TWD"]);

export function chargeCurrency(config: Cfg, fallback: string) {
  return (config.currency || fallback).trim().toUpperCase();
}

function exchangeRate(config: Cfg) {
  const rate = Number(config.exchangeRate);
  return Number.isFinite(rate) && rate > 0 ? rate : 1;
}

/** Store amount → integer minor units of the charge currency. */
export function toMinorUnits(amount: number, currency: string, rate = 1) {
  const major = amount / rate;
  return ZERO_DECIMAL.has(currency) ? Math.round(major) : Math.round(major * 100);
}

// ------------------------------------------------------------------- Xendit
// Invoice API: https://developers.xendit.co/api-reference/#create-invoice

const XENDIT_BASE = "https://api.xendit.co";

function xenditAuth(secrets: Cfg) {
  return `Basic ${Buffer.from(`${secrets.secretKey}:`).toString("base64")}`;
}

export function xenditCreateInvoice(secrets: Cfg, input: CheckoutInput): HttpRequest {
  const email = validEmail(input.customer.email);
  const phone = e164(input.customer.phone);
  const duration = secondsUntil(input.expiresAt, input.now ?? new Date());
  return {
    method: "POST",
    url: `${XENDIT_BASE}/v2/invoices`,
    headers: { Authorization: xenditAuth(secrets), "Content-Type": "application/json" },
    body: JSON.stringify({
      external_id: input.reference,
      amount: input.amount,
      currency: "IDR",
      description: input.description.slice(0, 250),
      ...(duration && duration > 60 ? { invoice_duration: duration } : {}),
      ...(email ? { payer_email: email } : {}),
      customer: {
        given_names: input.customer.name.slice(0, 50) || "Customer",
        ...(email ? { email } : {}),
        ...(phone ? { mobile_number: phone } : {}),
      },
      items: [{ name: input.description.slice(0, 250), quantity: 1, price: input.amount }],
      success_redirect_url: input.returnUrl,
      failure_redirect_url: input.cancelUrl,
    }),
  };
}

export function xenditGetInvoice(secrets: Cfg, invoiceId: string): HttpRequest {
  return {
    method: "GET",
    url: `${XENDIT_BASE}/v2/invoices/${encodeURIComponent(invoiceId)}`,
    headers: { Authorization: xenditAuth(secrets) },
  };
}

export function xenditBalance(secrets: Cfg): HttpRequest {
  return { method: "GET", url: `${XENDIT_BASE}/balance`, headers: { Authorization: xenditAuth(secrets) } };
}

export function mapXenditInvoice(invoice: Record<string, unknown>): GatewayStatus {
  const raw = String(invoice.status ?? "").toUpperCase();
  const status: PaymentStatus = raw === "PAID" || raw === "SETTLED" ? "PAID" : raw === "EXPIRED" ? "EXPIRED" : "PENDING";
  const paid = Number(invoice.paid_amount ?? invoice.amount);
  return {
    status,
    providerStatus: raw.toLowerCase() || "unknown",
    transactionId: typeof invoice.id === "string" ? invoice.id : null,
    paymentType: [invoice.payment_method, invoice.payment_channel].filter((v) => typeof v === "string" && v).join(":") || null,
    chargedMinor: Number.isFinite(paid) ? paid : null,
  };
}

// ------------------------------------------------------------------- Stripe
// Checkout Sessions: https://docs.stripe.com/api/checkout/sessions/create

const STRIPE_BASE = "https://api.stripe.com/v1";
/** Stripe accepts a session lifetime between 30 minutes and 24 hours. */
const STRIPE_MIN_TTL = 30 * 60;
const STRIPE_MAX_TTL = 24 * 60 * 60;

function stripeHeaders(secrets: Cfg) {
  return { Authorization: `Bearer ${secrets.secretKey}`, "Content-Type": "application/x-www-form-urlencoded" };
}

export function stripeCreateSession(config: Cfg, secrets: Cfg, input: CheckoutInput, storeCurrency: string): HttpRequest {
  const currency = chargeCurrency(config, storeCurrency);
  const now = input.now ?? new Date();
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("client_reference_id", input.reference);
  form.set("success_url", input.returnUrl);
  form.set("cancel_url", input.cancelUrl);
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", currency.toLowerCase());
  form.set("line_items[0][price_data][unit_amount]", String(toMinorUnits(input.amount, currency, exchangeRate(config))));
  form.set("line_items[0][price_data][product_data][name]", input.description.slice(0, 250) || "Order");
  form.set("metadata[payment_ref]", input.reference);
  form.set("payment_intent_data[metadata][payment_ref]", input.reference);
  const email = validEmail(input.customer.email);
  if (email) form.set("customer_email", email);
  const ttl = secondsUntil(input.expiresAt, now);
  if (ttl !== null) {
    const clamped = Math.min(Math.max(ttl, STRIPE_MIN_TTL + 60), STRIPE_MAX_TTL - 60);
    form.set("expires_at", String(Math.floor(now.getTime() / 1000) + clamped));
  }
  return { method: "POST", url: `${STRIPE_BASE}/checkout/sessions`, headers: stripeHeaders(secrets), body: form.toString() };
}

export function stripeGetSession(secrets: Cfg, sessionId: string): HttpRequest {
  return {
    method: "GET",
    url: `${STRIPE_BASE}/checkout/sessions/${encodeURIComponent(sessionId)}`,
    headers: { Authorization: `Bearer ${secrets.secretKey}` },
  };
}

export function stripeBalance(secrets: Cfg): HttpRequest {
  return { method: "GET", url: `${STRIPE_BASE}/balance`, headers: { Authorization: `Bearer ${secrets.secretKey}` } };
}

export function mapStripeSession(session: Record<string, unknown>): GatewayStatus {
  const paymentStatus = String(session.payment_status ?? "");
  const sessionStatus = String(session.status ?? "");
  let status: PaymentStatus = "PENDING";
  if (paymentStatus === "paid" || paymentStatus === "no_payment_required") status = "PAID";
  else if (sessionStatus === "expired") status = "EXPIRED";
  // A completed session that is still unpaid is a delayed method (bank debit)
  // in flight; it resolves through async_payment_succeeded/failed.
  const total = Number(session.amount_total);
  return {
    status,
    providerStatus: `${sessionStatus || "unknown"}/${paymentStatus || "unknown"}`,
    transactionId: typeof session.id === "string" ? session.id : null,
    paymentType: Array.isArray(session.payment_method_types) ? session.payment_method_types.join(",") : null,
    chargedMinor: Number.isFinite(total) ? total : null,
  };
}

/**
 * Verifies a `Stripe-Signature` header (`t=…,v1=…`): HMAC-SHA256 of
 * `${t}.${rawBody}`, rejected when older than the tolerance to stop replays.
 */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, now = new Date(), toleranceSeconds = 300) {
  if (!header || !secret) return false;
  const parts = header.split(",").map((part) => part.trim().split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value ?? "");
  if (!timestamp || !signatures.length) return false;
  const age = Math.abs(Math.floor(now.getTime() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  return signatures.some((signature) => safeEqualHex(signature, expected));
}

// ------------------------------------------------------------------- PayPal
// Orders v2: https://developer.paypal.com/docs/api/orders/v2/

export function paypalBase(config: Cfg) {
  return config.mode === "production" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

export function paypalToken(config: Cfg, secrets: Cfg): HttpRequest {
  return {
    method: "POST",
    url: `${paypalBase(config)}/v1/oauth2/token`,
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${secrets.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  };
}

/** PayPal's amount string for a store amount in the configured currency. */
export function paypalAmount(config: Cfg, amount: number) {
  const currency = chargeCurrency(config, "USD");
  const major = amount / exchangeRate(config);
  const value = PAYPAL_NO_DECIMAL.has(currency) ? String(Math.round(major)) : (Math.round(major * 100) / 100).toFixed(2);
  return { currency_code: currency, value };
}

export function paypalCreateOrder(config: Cfg, token: string, input: CheckoutInput): HttpRequest {
  return {
    method: "POST",
    url: `${paypalBase(config)}/v2/checkout/orders`,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      // Same reference → PayPal replays the same order instead of a duplicate.
      "PayPal-Request-Id": `order-${input.reference}`,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.reference,
          custom_id: input.reference,
          invoice_id: input.reference,
          description: input.description.slice(0, 127),
          amount: paypalAmount(config, input.amount),
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
          },
        },
      },
    }),
  };
}

export function paypalGetOrder(config: Cfg, token: string, orderId: string): HttpRequest {
  return {
    method: "GET",
    url: `${paypalBase(config)}/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    headers: { Authorization: `Bearer ${token}` },
  };
}

export function paypalCaptureOrder(config: Cfg, token: string, orderId: string, reference: string): HttpRequest {
  return {
    method: "POST",
    url: `${paypalBase(config)}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `capture-${reference}`,
    },
    body: "{}",
  };
}

export function paypalApproveLink(order: Record<string, unknown>) {
  const links = Array.isArray(order.links) ? (order.links as Array<{ rel?: string; href?: string }>) : [];
  return links.find((link) => link.rel === "payer-action" || link.rel === "approve")?.href ?? null;
}

/** `needsCapture` means the buyer approved and we still have to capture. */
export function mapPaypalOrder(order: Record<string, unknown>): GatewayStatus & { needsCapture: boolean } {
  const orderStatus = String(order.status ?? "").toUpperCase();
  const unit = (Array.isArray(order.purchase_units) ? order.purchase_units[0] : null) as
    | { payments?: { captures?: Array<{ id?: string; status?: string; amount?: { value?: string } }> } }
    | null;
  const capture = unit?.payments?.captures?.[0];
  const captureStatus = String(capture?.status ?? "").toUpperCase();
  let status: PaymentStatus = "PENDING";
  if (orderStatus === "COMPLETED" && captureStatus === "COMPLETED") status = "PAID";
  else if (captureStatus === "DECLINED" || captureStatus === "FAILED") status = "FAILED";
  else if (orderStatus === "VOIDED") status = "CANCELLED";
  const value = Number(capture?.amount?.value);
  return {
    status,
    needsCapture: orderStatus === "APPROVED",
    providerStatus: (captureStatus ? `${orderStatus}/${captureStatus}` : orderStatus || "unknown").toLowerCase(),
    transactionId: typeof order.id === "string" ? order.id : null,
    paymentType: "paypal",
    chargedMinor: Number.isFinite(value) ? Math.round(value * 100) : null,
  };
}

// ------------------------------------------------------------------- Duitku
// POP: https://docs.duitku.com/pop/en/ — mirrors the official duitku-php SDK.

function duitkuPopBase(config: Cfg) {
  return config.mode === "production" ? "https://api-prod.duitku.com" : "https://api-sandbox.duitku.com";
}

function duitkuApiBase(config: Cfg) {
  return config.mode === "production" ? "https://passport.duitku.com" : "https://sandbox.duitku.com";
}

export function duitkuCreateInvoice(config: Cfg, secrets: Cfg, input: CheckoutInput): HttpRequest {
  const now = input.now ?? new Date();
  const timestamp = String(now.getTime());
  const email = validEmail(input.customer.email);
  const phone = (input.customer.phone ?? "").replace(/\D/g, "");
  const ttl = secondsUntil(input.expiresAt, now);
  const minutes = ttl === null ? 60 * 24 : Math.max(Math.floor(ttl / 60), 5);
  const name = input.customer.name.slice(0, 20) || "Customer";
  return {
    method: "POST",
    url: `${duitkuPopBase(config)}/api/merchant/createInvoice`,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-duitku-signature": sha256(`${config.merchantCode}${timestamp}${secrets.apiKey}`),
      "x-duitku-timestamp": timestamp,
      "x-duitku-merchantcode": config.merchantCode,
    },
    body: JSON.stringify({
      paymentAmount: input.amount,
      merchantOrderId: input.reference,
      productDetails: input.description.slice(0, 255),
      ...(email ? { email } : {}),
      ...(phone ? { phoneNumber: phone } : {}),
      customerVaName: name,
      itemDetails: [{ name: input.description.slice(0, 50), price: input.amount, quantity: 1 }],
      customerDetail: { firstName: name, ...(email ? { email } : {}), ...(phone ? { phoneNumber: phone } : {}) },
      callbackUrl: input.callbackUrl,
      returnUrl: input.returnUrl,
      expiryPeriod: minutes,
    }),
  };
}

export function duitkuTransactionStatus(config: Cfg, secrets: Cfg, reference: string): HttpRequest {
  return {
    method: "POST",
    url: `${duitkuPopBase(config)}/api/merchant/transactionStatus`,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      merchantCode: config.merchantCode,
      merchantOrderId: reference,
      signature: md5(`${config.merchantCode}${reference}${secrets.apiKey}`),
    }),
  };
}

/** Jakarta wall-clock "YYYY-MM-DD HH:mm:ss", which Duitku signs. */
export function duitkuDatetime(now = new Date()) {
  const jakarta = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return jakarta.toISOString().slice(0, 19).replace("T", " ");
}

export function duitkuPaymentMethods(config: Cfg, secrets: Cfg, amount = 10000, now = new Date()): HttpRequest {
  const datetime = duitkuDatetime(now);
  return {
    method: "POST",
    url: `${duitkuApiBase(config)}/webapi/api/merchant/paymentmethod/getpaymentmethod`,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      merchantcode: config.merchantCode,
      amount,
      datetime,
      signature: sha256(`${config.merchantCode}${amount}${datetime}${secrets.apiKey}`),
    }),
  };
}

export function mapDuitkuStatus(payload: Record<string, unknown>): GatewayStatus {
  const code = String(payload.statusCode ?? payload.resultCode ?? "");
  const status: PaymentStatus = code === "00" ? "PAID" : code === "02" ? "FAILED" : "PENDING";
  const amount = Number(payload.amount);
  return {
    status,
    providerStatus: `${code || "?"} ${String(payload.statusMessage ?? "")}`.trim().toLowerCase(),
    transactionId: typeof payload.reference === "string" ? payload.reference : null,
    paymentType: typeof payload.paymentCode === "string" ? payload.paymentCode : null,
    chargedMinor: Number.isFinite(amount) ? Math.round(amount) : null,
  };
}

/** Callback signature: md5(merchantCode + amount + merchantOrderId + apiKey). */
export function verifyDuitkuCallback(fields: Record<string, string>, config: Cfg, secrets: Cfg) {
  if (!fields.signature || fields.merchantCode !== config.merchantCode) return false;
  const expected = md5(`${fields.merchantCode}${fields.amount}${fields.merchantOrderId}${secrets.apiKey}`);
  return safeEqualHex(fields.signature.toLowerCase(), expected);
}
