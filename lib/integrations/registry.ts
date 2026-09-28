// The catalog of connectable providers. Client-safe: no server imports.
//
// Each provider declares its fields once; the settings UI renders from this,
// the server validates against it, and secrets are recognised by `type`.

import type { IntegrationCategory } from "@prisma/client";

export type FieldType = "text" | "secret" | "url" | "email" | "number" | "select" | "boolean" | "textarea";

export type ProviderField = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string }[];
  /** Used when the field is left empty. */
  defaultValue?: string;
};

export type ProviderDefinition = {
  id: string;
  category: IntegrationCategory;
  name: string;
  tagline: string;
  docsUrl: string;
  fields: ProviderField[];
  /** Inbound webhooks this provider sends to us, shown as a URL to paste into its dashboard. */
  webhook?: { label: string; help: string };
  /** Extra capabilities within the category, e.g. newsletter contact sync. */
  capabilities?: ("transactional" | "newsletter" | "checkout" | "rates" | "messaging")[];
};

const SANDBOX_FIELD: ProviderField = {
  key: "mode",
  label: "Environment",
  type: "select",
  required: true,
  defaultValue: "sandbox",
  options: [
    { value: "sandbox", label: "Sandbox / test" },
    { value: "production", label: "Production / live" },
  ],
};

const FROM_FIELDS: ProviderField[] = [
  { key: "fromEmail", label: "Sender email", type: "email", required: true, placeholder: "hello@yourstore.com", help: "Must be a verified sender or domain in the provider." },
  { key: "fromName", label: "Sender name", type: "text", placeholder: "Your Store" },
];

export const PROVIDERS: ProviderDefinition[] = [
  // ---------------------------------------------------------------- Email
  {
    id: "resend",
    category: "EMAIL",
    name: "Resend",
    tagline: "Developer-first transactional email.",
    docsUrl: "https://resend.com/docs/api-reference/emails/send-email",
    capabilities: ["transactional"],
    fields: [{ key: "apiKey", label: "API key", type: "secret", required: true, placeholder: "re_…" }, ...FROM_FIELDS],
  },
  {
    id: "brevo",
    category: "EMAIL",
    name: "Brevo",
    tagline: "Transactional email plus newsletter contact lists.",
    docsUrl: "https://developers.brevo.com/reference/sendtransacemail",
    capabilities: ["transactional", "newsletter"],
    fields: [
      { key: "apiKey", label: "API key (v3)", type: "secret", required: true, placeholder: "xkeysib-…" },
      ...FROM_FIELDS,
      { key: "listId", label: "Newsletter list ID", type: "number", placeholder: "2", help: "Optional. New customers and form leads are added to this contact list." },
    ],
  },
  {
    id: "amazon_ses",
    category: "EMAIL",
    name: "Amazon SES",
    tagline: "High-volume email on AWS (SES v2 API).",
    docsUrl: "https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html",
    capabilities: ["transactional"],
    fields: [
      { key: "accessKeyId", label: "Access key ID", type: "text", required: true, placeholder: "AKIA…" },
      { key: "secretAccessKey", label: "Secret access key", type: "secret", required: true },
      { key: "region", label: "Region", type: "text", required: true, defaultValue: "ap-southeast-1", placeholder: "ap-southeast-1", help: "The region where your SES identity is verified." },
      ...FROM_FIELDS,
    ],
  },
  {
    id: "kirim_email",
    category: "EMAIL",
    name: "Kirim.Email",
    tagline: "Indonesian transactional email (SMTP API v4).",
    docsUrl: "https://smtp-app.kirim.email/docs",
    capabilities: ["transactional"],
    fields: [
      { key: "apiKey", label: "API username", type: "text", required: true, help: "SMTP app → API credentials." },
      { key: "apiSecret", label: "API token", type: "secret", required: true },
      { key: "domain", label: "Sending domain", type: "text", required: true, placeholder: "yourstore.com", help: "A domain verified in your Kirim.Email SMTP account." },
      ...FROM_FIELDS,
    ],
  },
  {
    id: "listmonk",
    category: "EMAIL",
    name: "Listmonk",
    tagline: "Self-hosted newsletter and transactional email.",
    docsUrl: "https://listmonk.app/docs/apis/transactional/",
    capabilities: ["transactional", "newsletter"],
    fields: [
      { key: "baseUrl", label: "Listmonk URL", type: "url", required: true, placeholder: "https://newsletter.yourstore.com" },
      { key: "apiUser", label: "API user", type: "text", required: true },
      { key: "apiToken", label: "API token", type: "secret", required: true },
      { key: "templateId", label: "Transactional template ID", type: "number", required: true, help: "A template of type \"transactional\" whose body is {{ .Tx.Data.html | Safe }}." },
      { key: "fromEmail", label: "Sender email", type: "email", placeholder: "Your Store <hello@yourstore.com>", help: "Optional. Defaults to Listmonk's sender." },
      { key: "listId", label: "Newsletter list ID", type: "number", placeholder: "1", help: "Optional. New customers and form leads are subscribed here." },
    ],
  },

  // -------------------------------------------------------------- Payment
  {
    id: "xendit",
    category: "PAYMENT",
    name: "Xendit",
    tagline: "Invoices with VA, e-wallet, QRIS, cards, and retail outlets.",
    docsUrl: "https://developers.xendit.co/api-reference/#create-invoice",
    capabilities: ["checkout"],
    webhook: { label: "Invoice callback URL", help: "Xendit Dashboard → Settings → Webhooks → Invoices paid/expired." },
    fields: [
      { key: "secretKey", label: "Secret API key", type: "secret", required: true, placeholder: "xnd_development_…", help: "Needs Money-in write permission." },
      { key: "callbackToken", label: "Webhook verification token", type: "secret", required: true, help: "Xendit Dashboard → Settings → Webhooks → View verification token." },
    ],
  },
  {
    id: "stripe",
    category: "PAYMENT",
    name: "Stripe",
    tagline: "Cards and wallets via Stripe Checkout.",
    docsUrl: "https://docs.stripe.com/api/checkout/sessions/create",
    capabilities: ["checkout"],
    webhook: { label: "Webhook endpoint", help: "Stripe Dashboard → Developers → Webhooks. Events: checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired." },
    fields: [
      { key: "secretKey", label: "Secret key", type: "secret", required: true, placeholder: "sk_test_… or rk_…" },
      { key: "webhookSecret", label: "Webhook signing secret", type: "secret", required: true, placeholder: "whsec_…" },
      { key: "currency", label: "Charge currency", type: "text", defaultValue: "IDR", placeholder: "IDR", help: "Three-letter code the buyer is charged in." },
      { key: "exchangeRate", label: "Store currency per 1 unit of charge currency", type: "number", placeholder: "1", help: "Leave empty when you charge in your store currency. e.g. 16000 converts Rp prices to USD." },
    ],
  },
  {
    id: "paypal",
    category: "PAYMENT",
    name: "PayPal",
    tagline: "PayPal and cards for international buyers.",
    docsUrl: "https://developer.paypal.com/docs/api/orders/v2/",
    capabilities: ["checkout"],
    webhook: { label: "Webhook URL", help: "PayPal Developer → your app → Webhooks. Events: CHECKOUT.ORDER.APPROVED, PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.DENIED." },
    fields: [
      SANDBOX_FIELD,
      { key: "clientId", label: "Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client secret", type: "secret", required: true },
      { key: "currency", label: "Charge currency", type: "text", required: true, defaultValue: "USD", placeholder: "USD", help: "PayPal does not settle IDR. Prices are converted with the rate below." },
      { key: "exchangeRate", label: "Store currency per 1 unit of charge currency", type: "number", required: true, placeholder: "16000", help: "e.g. 16000 means Rp16.000 = 1 USD. Buyers pay price ÷ rate, rounded to cents." },
    ],
  },
  {
    id: "duitku",
    category: "PAYMENT",
    name: "Duitku",
    tagline: "Duitku POP: VA, e-wallet, QRIS, retail, and cards.",
    docsUrl: "https://docs.duitku.com/pop/en/",
    capabilities: ["checkout"],
    webhook: { label: "Callback URL", help: "Sent automatically with each invoice; nothing to set up in the Duitku dashboard." },
    fields: [
      SANDBOX_FIELD,
      { key: "merchantCode", label: "Merchant code", type: "text", required: true, placeholder: "DXXXX" },
      { key: "apiKey", label: "API key", type: "secret", required: true },
    ],
  },

  // ---------------------------------------------------------------- Inbox
  {
    id: "telegram_inbox",
    category: "INBOX",
    name: "Telegram",
    tagline: "Customers message your bot; replies come from the inbox.",
    docsUrl: "https://core.telegram.org/bots/api#setwebhook",
    capabilities: ["messaging"],
    webhook: { label: "Bot webhook", help: "Registered with Telegram automatically when you test the connection." },
    fields: [
      { key: "botToken", label: "Bot token", type: "secret", required: true, placeholder: "123456:ABC…", help: "From @BotFather. Use a separate bot from the one that sends you order alerts." },
    ],
  },
  {
    id: "messenger",
    category: "INBOX",
    name: "Messenger",
    tagline: "Facebook Page messages in the inbox.",
    docsUrl: "https://developers.facebook.com/docs/messenger-platform/webhooks",
    capabilities: ["messaging"],
    webhook: { label: "Callback URL", help: "Meta App → Messenger → Webhooks. Subscribe the Page to the messages field." },
    fields: [
      { key: "pageId", label: "Page ID", type: "text", required: true },
      { key: "pageAccessToken", label: "Page access token", type: "secret", required: true },
      { key: "appSecret", label: "App secret", type: "secret", required: true, help: "Verifies that webhooks really come from Meta." },
      { key: "verifyToken", label: "Verify token", type: "text", required: true, help: "Any string; paste the same value in the Meta webhook setup." },
    ],
  },
  {
    id: "instagram",
    category: "INBOX",
    name: "Instagram",
    tagline: "Instagram Direct messages in the inbox.",
    docsUrl: "https://developers.facebook.com/docs/messenger-platform/instagram",
    capabilities: ["messaging"],
    webhook: { label: "Callback URL", help: "Meta App → Instagram → Webhooks. Subscribe to the messages field." },
    fields: [
      { key: "igAccountId", label: "Instagram account ID", type: "text", required: true, help: "The Instagram professional account linked to your Page." },
      { key: "pageAccessToken", label: "Page access token", type: "secret", required: true, help: "Token of the Facebook Page linked to the Instagram account." },
      { key: "appSecret", label: "App secret", type: "secret", required: true },
      { key: "verifyToken", label: "Verify token", type: "text", required: true },
    ],
  },
  {
    id: "webchat",
    category: "INBOX",
    name: "Webchat",
    tagline: "A chat bubble on your store; conversations land in the inbox.",
    docsUrl: "",
    capabilities: ["messaging"],
    fields: [
      { key: "greeting", label: "Greeting", type: "text", defaultValue: "Hi! How can we help?", placeholder: "Hi! How can we help?" },
      { key: "accentColor", label: "Bubble color", type: "text", defaultValue: "#111827", placeholder: "#111827" },
      { key: "position", label: "Position", type: "select", defaultValue: "right", options: [{ value: "right", label: "Bottom right" }, { value: "left", label: "Bottom left" }] },
    ],
  },

  // ------------------------------------------------------------- Shipping
  {
    id: "kiriminaja",
    category: "SHIPPING",
    name: "KiriminAja",
    tagline: "Live rates from 15+ couriers, with COD.",
    docsUrl: "https://developer.kiriminaja.com/docs",
    capabilities: ["rates"],
    fields: [
      SANDBOX_FIELD,
      { key: "apiKey", label: "API key", type: "secret", required: true, help: "KiriminAja dashboard → Integrasi." },
      { key: "originDistrictId", label: "Origin kecamatan ID", type: "number", required: true, help: "Search your warehouse's kecamatan in the test panel after saving." },
      { key: "couriers", label: "Couriers", type: "text", placeholder: "jne,jnt,sicepat,anteraja,idx", help: "Optional, comma-separated. Leave empty for all active couriers." },
    ],
  },
];

export const CATEGORY_META: Record<IntegrationCategory, { label: string; description: string }> = {
  EMAIL: { label: "Email & Newsletter", description: "Transactional email and newsletter lists." },
  PAYMENT: { label: "Payment Gateway", description: "Collect payments at checkout." },
  INBOX: { label: "Channel Inbox", description: "Customer conversations in one inbox." },
  SHIPPING: { label: "Courier & Shipping", description: "Live shipping rates at checkout." },
};

export function getProvider(id: string): ProviderDefinition | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}

export function providersIn(category: IntegrationCategory) {
  return PROVIDERS.filter((provider) => provider.category === category);
}

export function secretFieldKeys(provider: ProviderDefinition) {
  return provider.fields.filter((field) => field.type === "secret").map((field) => field.key);
}

export type FieldErrors = Record<string, string>;

/**
 * Validates submitted values for a provider. Secrets may be left blank when a
 * value is already stored (`storedSecrets`), meaning "keep the current one".
 */
export function validateProviderInput(
  provider: ProviderDefinition,
  input: Record<string, unknown>,
  storedSecrets: ReadonlySet<string> = new Set()
): { ok: true; config: Record<string, string>; secrets: Record<string, string> } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const config: Record<string, string> = {};
  const secrets: Record<string, string> = {};

  for (const field of provider.fields) {
    const raw = input[field.key];
    let value = typeof raw === "boolean" ? String(raw) : String(raw ?? "").trim();
    if (!value && field.defaultValue !== undefined && field.type !== "secret") value = field.defaultValue;

    if (!value) {
      if (field.required && !(field.type === "secret" && storedSecrets.has(field.key))) {
        errors[field.key] = `${field.label} is required.`;
      }
      continue;
    }
    if (value.length > 4000) {
      errors[field.key] = `${field.label} is too long.`;
      continue;
    }
    if (field.type === "url") {
      try {
        const url = new URL(value);
        if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protocol");
        value = value.replace(/\/+$/, "");
      } catch {
        errors[field.key] = "Enter a full URL starting with https://";
        continue;
      }
    }
    if (field.type === "email" && !/^(?:[^<>]*<)?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>?$/.test(value)) {
      errors[field.key] = "Enter a valid email address.";
      continue;
    }
    if (field.type === "number" && !/^\d+(\.\d+)?$/.test(value)) {
      errors[field.key] = "Enter a number.";
      continue;
    }
    if (field.type === "select" && field.options && !field.options.some((option) => option.value === value)) {
      errors[field.key] = "Pick one of the options.";
      continue;
    }
    if (field.type === "secret") secrets[field.key] = value;
    else config[field.key] = value;
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, config, secrets };
}
