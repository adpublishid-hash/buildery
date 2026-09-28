import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  buildSendRequest,
  normalizeWhatsAppNumber,
  parseSendResponse,
  WhatsAppConfigError,
  type SendOutcome,
  type WhatsAppConfig,
} from "@/lib/whatsapp/providers";

type Tx = Prisma.TransactionClient | PrismaClient;

const WHATSAPP_TIMEOUT_MS = 15000;
/** WhatsApp's own limit for a text message body. */
const WHATSAPP_MAX_TEXT_LENGTH = 4096;

/**
 * Resolves a workspace's outbound WhatsApp settings, or null when the
 * workspace has not switched WhatsApp on. Mirrors getWorkspaceTelegramConfig.
 */
export async function getWorkspaceWhatsAppConfig(
  workspaceId: string,
  db: Tx = prisma
): Promise<WhatsAppConfig | null> {
  const integration = await db.integrationSetting.findUnique({
    where: { workspaceId },
    select: {
      whatsappIsActive: true,
      whatsappProvider: true,
      whatsappApiKey: true,
      whatsappPhoneNumberId: true,
      whatsappApiBaseUrl: true,
      whatsappGraphVersion: true,
      whatsappUserCode: true,
    },
  });

  if (!integration?.whatsappIsActive || !integration.whatsappProvider) {
    return null;
  }

  return {
    provider: integration.whatsappProvider,
    apiKey: integration.whatsappApiKey ?? "",
    phoneNumberId: integration.whatsappPhoneNumberId ?? "",
    apiBaseUrl: integration.whatsappApiBaseUrl ?? "",
    graphVersion: integration.whatsappGraphVersion ?? "v25.0",
    userCode: integration.whatsappUserCode ?? "",
  };
}

/** A configuration problem, as opposed to a transient one. */
export type SendFailure = SendOutcome & { ok: false; permanent?: boolean };

export type WhatsAppSendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string; permanent: boolean };

/**
 * Sends one plain-text WhatsApp message.
 *
 * `permanent` separates "this will never work as configured" (bad settings,
 * unusable number) from "try again later" (network, provider 5xx). The job
 * runner uses it to decide between failing fast and retrying with backoff —
 * retrying a missing API key 3 times helps nobody.
 */
export async function sendWhatsAppText(
  config: WhatsAppConfig,
  to: string,
  text: string
): Promise<WhatsAppSendResult> {
  const recipient = normalizeWhatsAppNumber(to);
  if (!recipient) {
    return {
      ok: false,
      permanent: true,
      error: `Nomor WhatsApp tidak valid: ${to}`,
    };
  }

  const message = text.trim().slice(0, WHATSAPP_MAX_TEXT_LENGTH);
  if (!message) {
    return { ok: false, permanent: true, error: "Pesan kosong." };
  }

  let request;
  try {
    request = buildSendRequest(config, recipient, message);
  } catch (error) {
    if (error instanceof WhatsAppConfigError) {
      return { ok: false, permanent: true, error: error.message };
    }
    throw error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WHATSAPP_TIMEOUT_MS);

  try {
    const res = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    const rawBody = await res.text().catch(() => "");
    const outcome = parseSendResponse(config.provider, res.status, rawBody);

    if (outcome.ok) {
      return { ok: true, providerMessageId: outcome.providerMessageId };
    }

    // 4xx is the provider rejecting the request itself; repeating it verbatim
    // will be rejected the same way. 429 is the exception — that is timing.
    const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
    return { ok: false, permanent, error: outcome.error.slice(0, 500) };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? `Provider tidak merespons dalam ${WHATSAPP_TIMEOUT_MS / 1000} detik.`
        : error instanceof Error
          ? error.message
          : "Permintaan ke provider WhatsApp gagal.";
    // Network-level failures are worth another attempt.
    return { ok: false, permanent: false, error: reason.slice(0, 500) };
  } finally {
    clearTimeout(timer);
  }
}

/** Convenience wrapper for callers that only have a workspace id. */
export async function sendWorkspaceWhatsAppText(
  workspaceId: string,
  to: string,
  text: string
): Promise<WhatsAppSendResult> {
  const config = await getWorkspaceWhatsAppConfig(workspaceId);
  if (!config) {
    return {
      ok: false,
      permanent: true,
      error: "WhatsApp belum aktif di Settings > Integrasi.",
    };
  }
  return sendWhatsAppText(config, to, text);
}
