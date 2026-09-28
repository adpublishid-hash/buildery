import "server-only";

import type { InboxChannel } from "@prisma/client";

import { receiveInboxMessage } from "@/lib/actions/inbox";
import { reportError } from "@/lib/error-reporting";
import { prisma } from "@/lib/prisma";

import { getConnection, recordInboundEvent, webhookUrlFor, type LoadedConnection } from "../connections";
import { asTestResult, ProviderError, providerFetch, type TestResult } from "../http";
import type { HttpRequest } from "../email/requests";
import { CHANNEL_LABEL, CHANNEL_PROVIDER, PROVIDER_CHANNEL } from "./channel-map";
import {
  metaGetNode,
  metaSendMessage,
  parseMetaWebhook,
  parseTelegramUpdate,
  telegramGetMe,
  telegramSecretToken,
  telegramSendMessage,
  telegramSetWebhook,
  verifyMetaSignature,
  type ParsedChannelMessage,
} from "./requests";

/**
 * Telegram, Messenger, Instagram and web chat conversations in the shared
 * inbox. Each provider's webhook lands on the catalog endpoint, is verified
 * with that provider's own mechanism, and is stored through the same
 * receiveInboxMessage path WhatsApp uses (dedupe, customer match, alerts).
 */

async function call<T = Record<string, unknown>>(connection: LoadedConnection, request: HttpRequest) {
  return providerFetch<T>(connection.provider.name, request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
}

export type WebhookResponse = { status: number; body: Record<string, unknown> | string };

// ------------------------------------------------------------ verification

/** Meta's subscription handshake: echo `hub.challenge` for the right token. */
export function handleInboxVerification(connection: LoadedConnection, url: URL): WebhookResponse {
  const verifyToken = connection.config.verifyToken;
  if (
    (connection.provider.id === "messenger" || connection.provider.id === "instagram") &&
    url.searchParams.get("hub.mode") === "subscribe" &&
    verifyToken &&
    url.searchParams.get("hub.verify_token") === verifyToken
  ) {
    return { status: 200, body: url.searchParams.get("hub.challenge") ?? "" };
  }
  return { status: 403, body: { error: "Verification failed" } };
}

// ----------------------------------------------------------------- inbound

/** Best-effort display name; Meta only shares it with the right permissions. */
async function metaProfileName(connection: LoadedConnection, id: string) {
  try {
    const fields = connection.provider.id === "instagram" ? "name,username" : "name";
    const profile = await call<{ name?: string; username?: string }>(connection, metaGetNode(connection.secrets, id, fields));
    return profile.name || (profile.username ? `@${profile.username}` : "");
  } catch {
    return "";
  }
}

async function store(connection: LoadedConnection, channel: InboxChannel, message: ParsedChannelMessage) {
  return receiveInboxMessage({
    workspaceId: connection.workspaceId,
    channel,
    phone: message.contactId,
    name: message.name || null,
    body: message.body,
    kind: message.kind,
    mediaUrl: message.mediaUrl,
    mediaMimeType: message.mediaMimeType,
    mediaFilename: message.mediaFilename,
    // Namespaced: ids from different channels must never collide.
    providerMessageId: `${connection.provider.id}:${message.providerMessageId}`,
    provider: null,
  });
}

export async function handleInboxWebhook(connection: LoadedConnection, rawBody: string, headers: Headers): Promise<WebhookResponse> {
  const channel = PROVIDER_CHANNEL[connection.provider.id];
  if (!channel || channel === "WEBCHAT") return { status: 404, body: { error: "Not found" } };
  if (!connection.enabled) return { status: 200, body: { ok: true, ignored: "channel is turned off" } };

  let messages: ParsedChannelMessage[] = [];
  if (channel === "TELEGRAM") {
    const expected = telegramSecretToken(connection.webhookKey, connection.secrets.botToken ?? "");
    if (headers.get("x-telegram-bot-api-secret-token") !== expected) {
      await recordInboundEvent(connection.id, "Rejected a webhook without Telegram's secret token.").catch(() => {});
      return { status: 401, body: { error: "Unauthorized" } };
    }
    const parsed = parseTelegramUpdate(safeJson(rawBody));
    messages = parsed ? [parsed] : [];
  } else {
    if (!verifyMetaSignature(rawBody, headers.get("x-hub-signature-256"), connection.secrets.appSecret ?? "")) {
      await recordInboundEvent(connection.id, "Rejected a webhook with a bad Meta signature. Check the app secret.").catch(() => {});
      return { status: 401, body: { error: "Unauthorized" } };
    }
    const ownId = channel === "MESSENGER" ? connection.config.pageId : connection.config.igAccountId;
    messages = parseMetaWebhook(safeJson(rawBody), channel, ownId ?? "");
  }

  try {
    for (const message of messages) {
      if (!message.name && channel !== "TELEGRAM") {
        const known = await prisma.inboxConversation.findUnique({
          where: {
            workspaceId_channel_contactPhone: { workspaceId: connection.workspaceId, channel, contactPhone: message.contactId },
          },
          select: { contactName: true },
        });
        if (!known?.contactName) message.name = await metaProfileName(connection, message.contactId);
      }
      await store(connection, channel, message);
    }
    await recordInboundEvent(connection.id).catch(() => {});
    return { status: 200, body: { ok: true, stored: messages.length } };
  } catch (error) {
    reportError(`${connection.provider.id} inbox webhook failed`, error);
    // Non-2xx so the provider redelivers; the inbox dedupes the retry.
    return { status: 500, body: { error: "Storage failed" } };
  }
}

function safeJson(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- outbound

/**
 * Delivers one queued operator reply on a non-WhatsApp channel. Mirrors the
 * WhatsApp sender: permanent failures are marked FAILED, transient ones throw
 * so the job runner retries with backoff.
 */
export async function sendQueuedChannelMessage(message: {
  id: string;
  workspaceId: string;
  body: string;
  conversation: { contactPhone: string; channel: InboxChannel };
}): Promise<string> {
  const channel = message.conversation.channel as Exclude<InboxChannel, "WHATSAPP">;
  const label = CHANNEL_LABEL[channel];
  const connection = await getConnection(message.workspaceId, CHANNEL_PROVIDER[channel]);
  if (!connection?.enabled) {
    await markFailed(message.id, `${label} belum aktif di Pengaturan → Integrasi.`);
    return `${label} is switched off`;
  }

  const request =
    channel === "TELEGRAM"
      ? telegramSendMessage(connection.secrets, message.conversation.contactPhone, message.body)
      : channel === "MESSENGER" || channel === "INSTAGRAM"
        ? metaSendMessage(connection.secrets, message.conversation.contactPhone, message.body)
        : null;
  if (!request) {
    await markFailed(message.id, `${label} tidak mengirim lewat antrean.`);
    return "channel has no sender";
  }

  try {
    const response = await call(connection, request);
    const result = (response.result ?? response) as Record<string, unknown>;
    // Telegram answers {result: {message_id}}, the Send API {message_id}.
    const providerId = result.message_id;
    await prisma.inboxMessage.update({
      where: { id: message.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        providerMessageId: providerId ? `${connection.provider.id}:${String(providerId)}` : null,
        errorMessage: null,
      },
    });
    return `sent via ${label}`;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (error instanceof ProviderError && !error.retryable) {
      await markFailed(message.id, reason);
      return `permanent failure: ${reason}`;
    }
    await prisma.inboxMessage.update({ where: { id: message.id }, data: { errorMessage: reason.slice(0, 500) } });
    throw error;
  }
}

async function markFailed(messageId: string, error: string) {
  await prisma.inboxMessage.update({
    where: { id: messageId },
    data: { status: "FAILED", sentAt: null, errorMessage: error.slice(0, 500) },
  });
}

// -------------------------------------------------------------------- test

export async function testInboxConnection(connection: LoadedConnection): Promise<TestResult> {
  return asTestResult(async () => {
    switch (connection.provider.id) {
      case "telegram_inbox": {
        const me = await call<{ result?: { username?: string } }>(connection, telegramGetMe(connection.secrets));
        const url = webhookUrlFor(connection.provider.id, connection.webhookKey);
        if (!url.startsWith("https://")) {
          return `Bot @${me.result?.username ?? "?"} is valid. Telegram only delivers to an https URL, so the webhook was not registered from this local address.`;
        }
        await call(connection, telegramSetWebhook(connection.secrets, url, telegramSecretToken(connection.webhookKey, connection.secrets.botToken)));
        return `Bot @${me.result?.username ?? "?"} is connected and its webhook points here.`;
      }
      case "messenger": {
        const page = await call<{ id?: string; name?: string }>(connection, metaGetNode(connection.secrets, "me", "id,name"));
        if (connection.config.pageId && page.id !== connection.config.pageId) {
          throw new Error(`This token belongs to Page ${page.id}, not ${connection.config.pageId}.`);
        }
        return `Connected to the Page “${page.name ?? page.id}”.`;
      }
      case "instagram": {
        const account = await call<{ username?: string }>(connection, metaGetNode(connection.secrets, connection.config.igAccountId, "username"));
        return `Connected to @${account.username ?? connection.config.igAccountId}.`;
      }
      case "webchat":
        return "Web chat is ready. It appears on your site while it is enabled.";
      default:
        throw new Error(`${connection.provider.name} cannot be tested yet.`);
    }
  });
}
