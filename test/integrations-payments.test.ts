import { createHash, createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  duitkuCreateInvoice,
  duitkuDatetime,
  duitkuTransactionStatus,
  e164,
  mapDuitkuStatus,
  mapPaypalOrder,
  mapStripeSession,
  mapXenditInvoice,
  paypalAmount,
  paypalApproveLink,
  paypalCreateOrder,
  stripeCreateSession,
  toMinorUnits,
  verifyDuitkuCallback,
  verifyStripeSignature,
  xenditCreateInvoice,
  type CheckoutInput,
} from "@/lib/integrations/payments/requests";

const now = new Date("2026-09-28T10:00:00Z");
const input: CheckoutInput = {
  reference: "BD-ABC123",
  amount: 150000,
  description: "Kelas Desain",
  customer: { name: "Sari", email: "sari@contoh.id", phone: "0812-3456-7890" },
  returnUrl: "https://toko.id/api/integrations/payments/return?ref=BD-ABC123&access=t",
  cancelUrl: "https://toko.id/api/integrations/payments/return?ref=BD-ABC123&access=t&cancelled=1",
  callbackUrl: "https://toko.id/api/integrations/webhooks/duitku/key",
  expiresAt: new Date("2026-09-29T10:00:00Z"),
  now,
};

describe("shared helpers", () => {
  it("formats Indonesian numbers as E.164", () => {
    expect(e164("0812-3456-7890")).toBe("+6281234567890");
    expect(e164("+62 812 3456 7890")).toBe("+6281234567890");
    expect(e164("123")).toBeNull();
  });

  it("converts to minor units, honouring zero-decimal currencies and the rate", () => {
    expect(toMinorUnits(150000, "IDR")).toBe(15000000);
    expect(toMinorUnits(160000, "USD", 16000)).toBe(1000);
    expect(toMinorUnits(1000, "JPY")).toBe(1000);
  });
});

describe("Xendit", () => {
  it("creates an invoice with Basic auth and our reference as external_id", () => {
    const request = xenditCreateInvoice({ secretKey: "xnd_development_x" }, input);
    expect(request.url).toBe("https://api.xendit.co/v2/invoices");
    expect(request.headers.Authorization).toBe(`Basic ${Buffer.from("xnd_development_x:").toString("base64")}`);
    const body = JSON.parse(request.body!);
    expect(body).toMatchObject({
      external_id: "BD-ABC123",
      amount: 150000,
      invoice_duration: 86400,
      payer_email: "sari@contoh.id",
      customer: { given_names: "Sari", mobile_number: "+6281234567890" },
      success_redirect_url: input.returnUrl,
      failure_redirect_url: input.cancelUrl,
    });
  });

  it("maps invoice statuses", () => {
    expect(mapXenditInvoice({ id: "inv_1", status: "PAID", paid_amount: 150000, payment_method: "BANK_TRANSFER", payment_channel: "BCA" })).toEqual({
      status: "PAID",
      providerStatus: "paid",
      transactionId: "inv_1",
      paymentType: "BANK_TRANSFER:BCA",
      chargedMinor: 150000,
    });
    expect(mapXenditInvoice({ status: "SETTLED" }).status).toBe("PAID");
    expect(mapXenditInvoice({ status: "EXPIRED" }).status).toBe("EXPIRED");
    expect(mapXenditInvoice({ status: "PENDING" }).status).toBe("PENDING");
  });
});

describe("Stripe", () => {
  it("creates a Checkout Session in minor units with the reference attached", () => {
    const request = stripeCreateSession({ currency: "IDR" }, { secretKey: "sk_test_1" }, input, "IDR");
    const form = new URLSearchParams(request.body);
    expect(request.url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(request.headers.Authorization).toBe("Bearer sk_test_1");
    expect(form.get("client_reference_id")).toBe("BD-ABC123");
    expect(form.get("line_items[0][price_data][currency]")).toBe("idr");
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("15000000");
    expect(form.get("customer_email")).toBe("sari@contoh.id");
    // 24h minus a minute: inside Stripe's 30min–24h window.
    expect(Number(form.get("expires_at"))).toBe(Math.floor(now.getTime() / 1000) + 86340);
  });

  it("converts with the exchange rate when charging another currency", () => {
    const request = stripeCreateSession({ currency: "usd", exchangeRate: "15000" }, { secretKey: "sk" }, input, "IDR");
    const form = new URLSearchParams(request.body);
    expect(form.get("line_items[0][price_data][currency]")).toBe("usd");
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("1000");
  });

  it("maps sessions", () => {
    expect(mapStripeSession({ id: "cs_1", status: "complete", payment_status: "paid", amount_total: 15000000 }).status).toBe("PAID");
    expect(mapStripeSession({ status: "expired", payment_status: "unpaid" }).status).toBe("EXPIRED");
    expect(mapStripeSession({ status: "complete", payment_status: "unpaid" }).status).toBe("PENDING");
  });

  it("verifies signatures and rejects stale or forged ones", () => {
    const body = '{"id":"evt_1","type":"checkout.session.completed"}';
    const t = Math.floor(now.getTime() / 1000);
    const v1 = createHmac("sha256", "whsec_test").update(`${t}.${body}`).digest("hex");
    expect(verifyStripeSignature(body, `t=${t},v1=${v1}`, "whsec_test", now)).toBe(true);
    expect(verifyStripeSignature(body, `t=${t},v1=deadbeef,v1=${v1}`, "whsec_test", now)).toBe(true);
    expect(verifyStripeSignature(body, `t=${t},v1=${v1}`, "whsec_other", now)).toBe(false);
    expect(verifyStripeSignature(`${body} `, `t=${t},v1=${v1}`, "whsec_test", now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t},v1=${v1}`, "whsec_test", new Date(now.getTime() + 10 * 60_000))).toBe(false);
    expect(verifyStripeSignature(body, null, "whsec_test", now)).toBe(false);
  });
});

describe("PayPal", () => {
  const config = { mode: "sandbox", clientId: "cid", currency: "USD", exchangeRate: "16000" };

  it("converts the store amount to the charge currency", () => {
    expect(paypalAmount(config, 150000)).toEqual({ currency_code: "USD", value: "9.38" });
    expect(paypalAmount({ ...config, currency: "JPY", exchangeRate: "100" }, 150000)).toEqual({ currency_code: "JPY", value: "1500" });
  });

  it("creates a CAPTURE order on the sandbox with an idempotency key", () => {
    const request = paypalCreateOrder(config, "tok", input);
    expect(request.url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
    expect(request.headers["PayPal-Request-Id"]).toBe("order-BD-ABC123");
    const body = JSON.parse(request.body!);
    expect(body.intent).toBe("CAPTURE");
    expect(body.purchase_units[0]).toMatchObject({ custom_id: "BD-ABC123", invoice_id: "BD-ABC123", amount: { currency_code: "USD", value: "9.38" } });
    expect(body.payment_source.paypal.experience_context.return_url).toBe(input.returnUrl);
  });

  it("finds the approval link", () => {
    expect(paypalApproveLink({ links: [{ rel: "self", href: "a" }, { rel: "payer-action", href: "https://paypal.com/pay" }] })).toBe("https://paypal.com/pay");
  });

  it("maps orders, flagging approvals that still need a capture", () => {
    expect(mapPaypalOrder({ id: "O1", status: "APPROVED" })).toMatchObject({ status: "PENDING", needsCapture: true });
    const captured = mapPaypalOrder({
      id: "O1",
      status: "COMPLETED",
      purchase_units: [{ payments: { captures: [{ status: "COMPLETED", amount: { value: "9.38" } }] } }],
    });
    expect(captured).toMatchObject({ status: "PAID", needsCapture: false, chargedMinor: 938 });
    expect(mapPaypalOrder({ status: "COMPLETED", purchase_units: [{ payments: { captures: [{ status: "DECLINED" }] } }] }).status).toBe("FAILED");
    expect(mapPaypalOrder({ status: "VOIDED" }).status).toBe("CANCELLED");
  });
});

describe("Duitku", () => {
  const config = { mode: "sandbox", merchantCode: "D0001" };
  const secrets = { apiKey: "732B39FC61796845775D2C4FB05332AF" };

  it("signs createInvoice like the official SDK", () => {
    const request = duitkuCreateInvoice(config, secrets, input);
    const timestamp = String(now.getTime());
    expect(request.url).toBe("https://api-sandbox.duitku.com/api/merchant/createInvoice");
    expect(request.headers["x-duitku-timestamp"]).toBe(timestamp);
    expect(request.headers["x-duitku-signature"]).toBe(
      createHash("sha256").update(`D0001${timestamp}${secrets.apiKey}`).digest("hex")
    );
    const body = JSON.parse(request.body!);
    expect(body).toMatchObject({ paymentAmount: 150000, merchantOrderId: "BD-ABC123", callbackUrl: input.callbackUrl, expiryPeriod: 1440 });
  });

  it("signs transactionStatus with md5(merchantCode + orderId + apiKey)", () => {
    const body = JSON.parse(duitkuTransactionStatus(config, secrets, "BD-ABC123").body!);
    expect(body.signature).toBe(createHash("md5").update(`D0001BD-ABC123${secrets.apiKey}`).digest("hex"));
  });

  it("verifies callbacks and refuses another merchant's", () => {
    const fields = { merchantCode: "D0001", amount: "150000", merchantOrderId: "BD-ABC123", resultCode: "00" };
    const signature = createHash("md5").update(`D0001150000BD-ABC123${secrets.apiKey}`).digest("hex");
    expect(verifyDuitkuCallback({ ...fields, signature }, config, secrets)).toBe(true);
    expect(verifyDuitkuCallback({ ...fields, amount: "1", signature }, config, secrets)).toBe(false);
    expect(verifyDuitkuCallback({ ...fields, merchantCode: "D9999", signature }, config, secrets)).toBe(false);
  });

  it("maps status codes", () => {
    expect(mapDuitkuStatus({ statusCode: "00", amount: "150000", reference: "R1" })).toMatchObject({ status: "PAID", chargedMinor: 150000, transactionId: "R1" });
    expect(mapDuitkuStatus({ statusCode: "01" }).status).toBe("PENDING");
    expect(mapDuitkuStatus({ statusCode: "02" }).status).toBe("FAILED");
  });

  it("formats the signed datetime in Jakarta time", () => {
    expect(duitkuDatetime(now)).toBe("2026-09-28 17:00:00");
  });
});
