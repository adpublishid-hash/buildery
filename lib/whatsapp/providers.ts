import type { WhatsAppProvider } from "@prisma/client";

/**
 * Outbound WhatsApp transport, one adapter per provider.
 *
 * Request building and response parsing are kept pure here so they can be
 * unit-tested without a network — `send.ts` does the fetch.
 */

export type WhatsAppConfig = {
  provider: WhatsAppProvider;
  apiKey: string;
  /** Cloud API phone number id, or the device id for gateway providers. */
  phoneNumberId: string;
  /** Required by the self-hosted/gateway providers; unused by WABA. */
  apiBaseUrl: string;
  graphVersion: string;
};

export type WhatsAppRequest = {
  url: string;
  headers: Record<string, string>;
  body: string;
};

export type SendOutcome =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string };

/**
 * Normalizes to digits only. WhatsApp APIs reject "+62 812-3456" but accept
 * the same number as 628123456. A leading 0 is Indonesian local notation and
 * is replaced with the country code, which is the single most common cause of
 * silently undelivered messages here.
 */
export function normalizeWhatsAppNumber(
  raw: string,
  defaultCountryCode = "62"
): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const withCountry = digits.startsWith("0")
    ? `${defaultCountryCode}${digits.slice(1)}`
    : digits;
  // Shortest plausible MSISDN including country code.
  return withCountry.length >= 8 ? withCountry : null;
}

export class WhatsAppConfigError extends Error {}

/** Documented endpoints, verified against each vendor's own API reference. */
const WABA_DEFAULT_BASE = "https://graph.facebook.com";
const ONESENDER_PATH = "/api/v1/messages";
const STARSENDER_DEFAULT_BASE = "https://api.starsender.online";
const STARSENDER_PATH = "/api/send";

/**
 * Builds the provider-specific HTTP request for one plain-text message.
 * Throws WhatsAppConfigError when the workspace's settings can't produce a
 * valid call — a configuration problem, not a transient failure, so the job
 * runner must not retry it.
 */
export function buildSendRequest(
  config: WhatsAppConfig,
  to: string,
  text: string
): WhatsAppRequest {
  if (!config.apiKey) {
    throw new WhatsAppConfigError(
      "API key WhatsApp belum diisi di Settings > Integrasi."
    );
  }

  if (config.provider === "WABA") {
    if (!config.phoneNumberId) {
      throw new WhatsAppConfigError(
        "Phone Number ID wajib diisi untuk WhatsApp Business API."
      );
    }
    const version = config.graphVersion || "v25.0";
    const base = config.apiBaseUrl || WABA_DEFAULT_BASE;
    return {
      url: joinEndpoint(base, `/${version}/${config.phoneNumberId}/messages`),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body: text },
      }),
    };
  }

  if (config.provider === "ONESENDER") {
    // OneSender is self-hosted, so only the operator knows the host. Its
    // payload mirrors the Cloud API minus `messaging_product`.
    if (!config.apiBaseUrl) {
      throw new WhatsAppConfigError(
        "URL API OneSender belum diisi di Settings > Integrasi."
      );
    }
    return {
      url: joinEndpoint(config.apiBaseUrl, ONESENDER_PATH),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: text },
      }),
    };
  }

  // StarSender is a hosted service on one fixed endpoint, and its API key
  // goes in Authorization raw — no Bearer prefix.
  return {
    url: joinEndpoint(config.apiBaseUrl || STARSENDER_DEFAULT_BASE, STARSENDER_PATH),
    headers: {
      "content-type": "application/json",
      authorization: config.apiKey,
    },
    body: JSON.stringify({
      messageType: "text",
      to,
      body: text,
    }),
  };
}

/**
 * Appends a provider's documented path unless the operator already pasted a
 * full endpoint URL, so both "https://wa.example.com" and
 * "https://wa.example.com/api/v1/messages" resolve to the same call.
 */
function joinEndpoint(base: string, path: string) {
  const trimmed = trimSlash(base);
  return trimmed.endsWith(path) ? trimmed : `${trimmed}${path}`;
}

/**
 * Reads a provider's reply. These gateways are inconsistent — some return
 * HTTP 200 with a failure in the body — so success is decided from the parsed
 * payload, not the status code alone.
 */
export function parseSendResponse(
  provider: WhatsAppProvider,
  status: number,
  rawBody: string
): SendOutcome {
  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Some gateways answer with plain text.
  }

  if (status < 200 || status >= 300) {
    return { ok: false, error: describeError(payload, rawBody, status) };
  }

  if (provider === "WABA") {
    const id = readWabaMessageId(payload);
    // A 2xx with no message id means Meta accepted nothing.
    if (!id) return { ok: false, error: describeError(payload, rawBody, status) };
    return { ok: true, providerMessageId: id };
  }

  const record = asRecord(payload);
  // Gateways commonly signal failure in the body of a 200 response.
  const explicitFailure =
    record.success === false ||
    record.status === false ||
    (typeof record.status === "string" &&
      ["error", "failed", "fail"].includes(record.status.toLowerCase()));
  if (explicitFailure) {
    return { ok: false, error: describeError(payload, rawBody, status) };
  }

  return { ok: true, providerMessageId: readGatewayMessageId(record) };
}

function readWabaMessageId(payload: unknown): string | null {
  const messages = asRecord(payload).messages;
  if (!Array.isArray(messages) || messages.length === 0) return null;
  const id = asRecord(messages[0]).id;
  return typeof id === "string" && id ? id : null;
}

function readGatewayMessageId(record: Record<string, unknown>): string | null {
  for (const key of ["id", "messageId", "message_id", "msgId"]) {
    const value = record[key];
    if (typeof value === "string" && value) return value;
    if (typeof value === "number") return String(value);
  }
  const data = asRecord(record.data);
  for (const key of ["id", "messageId", "message_id"]) {
    const value = data[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

/**
 * Surfaces what the provider actually said. The raw reply is the fastest way
 * for an operator to see a wrong endpoint or a rejected token, so it is kept
 * rather than replaced with a generic message.
 */
function describeError(payload: unknown, rawBody: string, status: number) {
  const record = asRecord(payload);
  const metaError = asRecord(record.error);
  const message =
    firstString([
      metaError.message,
      record.message,
      record.error,
      record.reason,
      record.msg,
    ]) ?? rawBody.trim().slice(0, 300);

  return `HTTP ${status}: ${message || "provider tidak memberi keterangan"}`;
}

function firstString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function trimSlash(value: string) {
  return value.trim().replace(/\/+$/, "");
}
