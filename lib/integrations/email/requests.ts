// Pure request builders for email providers. No network, no server-only
// imports, so they can be unit-tested; `send.ts` does the fetching.

import { createHash, createHmac } from "node:crypto";

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

export type HttpRequest = {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: string;
};

type Cfg = Record<string, string>;

function fromHeader(config: Cfg) {
  return config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail;
}

/** Minimal HTML for providers that insist on it when only text is given. */
export function textToHtml(text: string) {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:system-ui,sans-serif;white-space:pre-wrap">${escaped}</div>`;
}

// ------------------------------------------------------------------ Resend
export function resendSend(config: Cfg, secrets: Cfg, email: OutgoingEmail): HttpRequest {
  return {
    method: "POST",
    url: "https://api.resend.com/emails",
    headers: { Authorization: `Bearer ${secrets.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromHeader(config),
      to: [email.to],
      subject: email.subject,
      text: email.text,
      ...(email.html ? { html: email.html } : {}),
      ...(email.replyTo ? { reply_to: email.replyTo } : {}),
    }),
  };
}

// ------------------------------------------------------------------- Brevo
export function brevoSend(config: Cfg, secrets: Cfg, email: OutgoingEmail): HttpRequest {
  return {
    method: "POST",
    url: "https://api.brevo.com/v3/smtp/email",
    headers: { "api-key": secrets.apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { email: config.fromEmail, ...(config.fromName ? { name: config.fromName } : {}) },
      to: [{ email: email.to }],
      subject: email.subject,
      htmlContent: email.html ?? textToHtml(email.text),
      textContent: email.text,
      ...(email.replyTo ? { replyTo: { email: email.replyTo } } : {}),
    }),
  };
}

export function brevoUpsertContact(config: Cfg, secrets: Cfg, contact: { email: string; name?: string }): HttpRequest | null {
  const listId = Number(config.listId);
  if (!Number.isInteger(listId) || listId <= 0) return null;
  return {
    method: "POST",
    url: "https://api.brevo.com/v3/contacts",
    headers: { "api-key": secrets.apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      email: contact.email,
      ...(contact.name ? { attributes: { FIRSTNAME: contact.name } } : {}),
      listIds: [listId],
      updateEnabled: true,
    }),
  };
}

// ------------------------------------------------------------- Kirim.Email
// Official SDK (@kirimemail/smtp-sdk): Basic auth, JSON body,
// POST /api/domains/{domain}/message on https://smtp-app.kirim.email.
export function kirimEmailSend(config: Cfg, secrets: Cfg, email: OutgoingEmail): HttpRequest {
  const auth = Buffer.from(`${config.apiKey}:${secrets.apiSecret}`).toString("base64");
  return {
    method: "POST",
    url: `https://smtp-app.kirim.email/api/domains/${encodeURIComponent(config.domain)}/message`,
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      from: config.fromEmail,
      ...(config.fromName ? { from_name: config.fromName } : {}),
      to: email.to,
      subject: email.subject,
      text: email.text,
      ...(email.html ? { html: email.html } : {}),
      ...(email.replyTo ? { headers: { "Reply-To": email.replyTo } } : {}),
    }),
  };
}

// ---------------------------------------------------------------- Listmonk
function listmonkAuth(config: Cfg, secrets: Cfg) {
  return `token ${config.apiUser}:${secrets.apiToken}`;
}

/** Transactional send in `external` mode: recipients need not be subscribers. */
export function listmonkSend(config: Cfg, secrets: Cfg, email: OutgoingEmail): HttpRequest {
  return {
    method: "POST",
    url: `${config.baseUrl}/api/tx`,
    headers: { Authorization: listmonkAuth(config, secrets), "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      subscriber_mode: "external",
      subscriber_emails: [email.to],
      template_id: Number(config.templateId),
      subject: email.subject,
      ...(config.fromEmail ? { from_email: config.fromEmail } : {}),
      data: { html: email.html ?? textToHtml(email.text), text: email.text },
      content_type: "html",
      altbody: email.text,
      ...(email.replyTo ? { headers: [{ "Reply-To": email.replyTo }] } : {}),
    }),
  };
}

export function listmonkCreateSubscriber(config: Cfg, secrets: Cfg, contact: { email: string; name?: string }): HttpRequest | null {
  const listId = Number(config.listId);
  if (!Number.isInteger(listId) || listId <= 0) return null;
  return {
    method: "POST",
    url: `${config.baseUrl}/api/subscribers`,
    headers: { Authorization: listmonkAuth(config, secrets), "Content-Type": "application/json" },
    body: JSON.stringify({
      email: contact.email,
      name: contact.name || contact.email.split("@")[0],
      status: "enabled",
      lists: [listId],
      preconfirm_subscriptions: true,
    }),
  };
}

export function listmonkHealth(config: Cfg, secrets: Cfg): HttpRequest {
  return { method: "GET", url: `${config.baseUrl}/api/health`, headers: { Authorization: listmonkAuth(config, secrets) } };
}

// -------------------------------------------------------------- Amazon SES
const sha256Hex = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const hmac = (key: Buffer | string, value: string) => createHmac("sha256", key).update(value, "utf8").digest();

/** AWS Signature Version 4 signing key (exported for the published test vector). */
export function sigV4SigningKey(secretAccessKey: string, date: string, region: string, service: string) {
  const kDate = hmac(`AWS4${secretAccessKey}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

/** Signs a request with SigV4 (header-based, no query string, JSON body). */
export function signAwsRequest(input: {
  method: "GET" | "POST";
  host: string;
  path: string;
  body: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  now?: Date;
}): Record<string, string> {
  const now = input.now ?? new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const date = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(input.body);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: input.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((key) => `${key}:${headers[key].trim()}\n`)
    .join("");
  const canonicalRequest = [input.method, input.path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", sigV4SigningKey(input.secretAccessKey, date, input.region, input.service))
    .update(stringToSign, "utf8")
    .digest("hex");
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function sesRequest(config: Cfg, secrets: Cfg, method: "GET" | "POST", path: string, body: string, now?: Date): HttpRequest {
  const host = `email.${config.region}.amazonaws.com`;
  const headers = signAwsRequest({
    method,
    host,
    path,
    body,
    region: config.region,
    service: "ses",
    accessKeyId: config.accessKeyId,
    secretAccessKey: secrets.secretAccessKey,
    now,
  });
  delete headers.host; // fetch sets Host itself; it is still part of the signature.
  return { method, url: `https://${host}${path}`, headers, ...(method === "POST" ? { body } : {}) };
}

export function sesSend(config: Cfg, secrets: Cfg, email: OutgoingEmail, now?: Date): HttpRequest {
  const body = JSON.stringify({
    FromEmailAddress: fromHeader(config),
    Destination: { ToAddresses: [email.to] },
    ...(email.replyTo ? { ReplyToAddresses: [email.replyTo] } : {}),
    Content: {
      Simple: {
        Subject: { Data: email.subject, Charset: "UTF-8" },
        Body: {
          Text: { Data: email.text, Charset: "UTF-8" },
          ...(email.html ? { Html: { Data: email.html, Charset: "UTF-8" } } : {}),
        },
      },
    },
  });
  return sesRequest(config, secrets, "POST", "/v2/email/outbound-emails", body, now);
}

export function sesAccount(config: Cfg, secrets: Cfg, now?: Date): HttpRequest {
  return sesRequest(config, secrets, "GET", "/v2/email/account", "", now);
}
