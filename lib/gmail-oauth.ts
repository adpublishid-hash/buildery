import "server-only";

const GMAIL_SEND_ENDPOINT =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export type GmailOAuthConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  senderEmail: string;
  senderName?: string | null;
};

export type GmailOAuthMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export async function sendGmailOAuthEmail(
  config: GmailOAuthConfig,
  message: GmailOAuthMessage
) {
  const accessToken = await refreshGmailAccessToken(config);
  const raw = buildGmailRawMessage(config, message);
  const res = await fetch(GMAIL_SEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Gmail ${res.status}: ${body.slice(0, 300) || "request failed"}`
    );
  }
}

async function refreshGmailAccessToken(config: GmailOAuthConfig) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => null)) as TokenResponse | null;
  if (!res.ok || !json?.access_token) {
    const detail =
      json?.error_description || json?.error || `HTTP ${res.status}`;
    throw new Error(`Gmail OAuth token refresh failed: ${detail}`);
  }
  return json.access_token;
}

export function buildGmailRawMessage(
  config: GmailOAuthConfig,
  message: GmailOAuthMessage
) {
  const headers = [
    `From: ${formatAddress(config.senderEmail, config.senderName)}`,
    `To: ${sanitizeHeader(message.to)}`,
    message.replyTo ? `Reply-To: ${sanitizeHeader(message.replyTo)}` : null,
    `Subject: ${encodeHeader(message.subject)}`,
    "MIME-Version: 1.0",
  ].filter((header): header is string => Boolean(header));

  const mime = message.html
    ? buildMultipartMessage(headers, message.text, message.html)
    : buildSinglePartMessage(headers, message.text);

  return base64UrlEncode(mime);
}

function buildSinglePartMessage(headers: string[], text: string) {
  return [
    ...headers,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(base64Encode(text)),
  ].join("\r\n");
}

function buildMultipartMessage(headers: string[], text: string, html: string) {
  const boundary = `buildery_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2)}`;
  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(base64Encode(text)),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(base64Encode(html)),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function formatAddress(email: string, name?: string | null) {
  const cleanEmail = sanitizeHeader(email);
  const cleanName = sanitizeHeader(name ?? "").trim();
  if (!cleanName) return cleanEmail;
  if (/^[\x20-\x7E]+$/.test(cleanName)) {
    return `"${cleanName.replace(/["\\]/g, "\\$&")}" <${cleanEmail}>`;
  }
  return `${encodeHeader(cleanName)} <${cleanEmail}>`;
}

function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeHeader(value: string) {
  const clean = sanitizeHeader(value);
  if (/^[\x20-\x7E]+$/.test(clean)) return clean;
  return `=?UTF-8?B?${base64Encode(clean)}?=`;
}

function base64Encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function wrapBase64(value: string) {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}
