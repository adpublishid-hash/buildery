import { createHmac, timingSafeEqual } from "node:crypto";

import type { WhatsAppProvider } from "@prisma/client";

/**
 * Decides whether an inbound WhatsApp webhook really came from the workspace's
 * provider.
 *
 * The inbox endpoint is public and addressed by workspaceId, so without this
 * anyone who learns an id can inject messages into that store's inbox. It
 * fails closed: a workspace with no webhook secret configured accepts nothing.
 *
 * - WABA (Meta Cloud API) signs the raw body: `X-Hub-Signature-256:
 *   sha256=<hmac>`, keyed by the app secret.
 * - WAHA signs the raw body with HMAC-SHA512: `X-Webhook-Hmac: <hex>`, keyed
 *   by the session's `hmac.key`.
 * - Other gateways (OneSender, StarSender, Woowa, Kirimi) do not sign, so the secret is presented
 *   as a shared token: `X-Webhook-Secret`, `Authorization: Bearer`, or a
 *   `secret` query parameter for gateways that can only configure a URL.
 */

export type InboxWebhookAuthInput = {
  provider: WhatsAppProvider | null;
  secret: string | null | undefined;
  rawBody: string;
  headers: Headers;
  url: URL;
};

export type InboxWebhookAuthResult =
  | { ok: true }
  | { ok: false; reason: "no_secret_configured" | "missing_credentials" | "bad_signature" };

export function verifyInboxWebhook(
  input: InboxWebhookAuthInput
): InboxWebhookAuthResult {
  const secret = input.secret?.trim();
  if (!secret) return { ok: false, reason: "no_secret_configured" };

  const signature = input.headers.get("x-hub-signature-256");
  if (signature) {
    const expected = `sha256=${createHmac("sha256", secret)
      .update(input.rawBody, "utf8")
      .digest("hex")}`;
    return safeEqual(signature.trim(), expected)
      ? { ok: true }
      : { ok: false, reason: "bad_signature" };
  }

  const wahaHmac = input.headers.get("x-webhook-hmac");
  if (wahaHmac) {
    const algorithm = (input.headers.get("x-webhook-hmac-algorithm") || "sha512").toLowerCase();
    if (algorithm !== "sha512") return { ok: false, reason: "bad_signature" };
    const expected = createHmac("sha512", secret).update(input.rawBody, "utf8").digest("hex");
    return safeEqual(wahaHmac.trim().toLowerCase(), expected)
      ? { ok: true }
      : { ok: false, reason: "bad_signature" };
  }

  // Meta always signs. A WABA delivery without a signature is not from Meta.
  if (input.provider === "WABA") {
    return { ok: false, reason: "missing_credentials" };
  }

  const presented =
    input.headers.get("x-webhook-secret") ??
    bearer(input.headers.get("authorization")) ??
    input.url.searchParams.get("secret");
  if (!presented) return { ok: false, reason: "missing_credentials" };

  return safeEqual(presented.trim(), secret)
    ? { ok: true }
    : { ok: false, reason: "bad_signature" };
}

/** Constant-time comparison for the GET verify-token handshake too. */
export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function bearer(header: string | null) {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}
