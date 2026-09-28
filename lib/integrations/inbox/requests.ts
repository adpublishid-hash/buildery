// Pure request builders and webhook parsers for the inbox channels. No network
// and no server-only imports, so they are unit-tested; `channels.ts` fetches.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { InboxChannel, InboxMessageKind } from "@prisma/client";

import type { HttpRequest } from "../email/requests";

type Cfg = Record<string, string>;

export type ParsedChannelMessage = {
  /** Chat id (Telegram), PSID (Messenger), IGSID (Instagram). */
  contactId: string;
  name: string;
  body: string;
  kind: InboxMessageKind;
  providerMessageId: string;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  mediaFilename: string | null;
};

function str(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// ---------------------------------------------------------------- Telegram
// Bot API: https://core.telegram.org/bots/api

const TELEGRAM_API = "https://api.telegram.org";

function telegramUrl(secrets: Cfg, method: string) {
  return `${TELEGRAM_API}/bot${secrets.botToken}/${method}`;
}

export function telegramGetMe(secrets: Cfg): HttpRequest {
  return { method: "GET", url: telegramUrl(secrets, "getMe"), headers: {} };
}

/**
 * The `secret_token` Telegram echoes in `X-Telegram-Bot-Api-Secret-Token`.
 * Derived from the webhook key and bot token so nothing extra is stored, and
 * rotating either one invalidates old deliveries.
 */
export function telegramSecretToken(webhookKey: string, botToken: string) {
  return createHmac("sha256", botToken).update(`inbox-webhook:${webhookKey}`).digest("hex");
}

export function telegramSetWebhook(secrets: Cfg, url: string, secretToken: string): HttpRequest {
  return {
    method: "POST",
    url: telegramUrl(secrets, "setWebhook"),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, secret_token: secretToken, allowed_updates: ["message"], drop_pending_updates: false }),
  };
}

export function telegramSendMessage(secrets: Cfg, chatId: string, text: string): HttpRequest {
  return {
    method: "POST",
    url: telegramUrl(secrets, "sendMessage"),
    headers: { "Content-Type": "application/json" },
    // Telegram caps a message at 4096 characters.
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096) }),
  };
}

const TELEGRAM_KINDS: Array<[string, InboxMessageKind]> = [
  ["photo", "IMAGE"],
  ["video", "VIDEO"],
  ["video_note", "VIDEO"],
  ["voice", "AUDIO"],
  ["audio", "AUDIO"],
  ["document", "DOCUMENT"],
  ["sticker", "STICKER"],
  ["location", "LOCATION"],
];

/**
 * One private-chat message from a Telegram update. Group chats are skipped:
 * the inbox models one customer per thread. Media arrives as file ids whose
 * download link embeds the bot token, so only the kind and caption are kept.
 */
export function parseTelegramUpdate(update: unknown): ParsedChannelMessage | null {
  const message = record(record(update).message);
  const chat = record(message.chat);
  if (!message.message_id || chat.type !== "private") return null;
  const from = record(message.from);
  if (from.is_bot === true) return null;

  let kind: InboxMessageKind = "TEXT";
  let mime: string | null = null;
  let filename: string | null = null;
  for (const [key, value] of TELEGRAM_KINDS) {
    if (message[key]) {
      kind = value;
      const media = record(message[key]);
      mime = str(media.mime_type) || null;
      filename = str(media.file_name) || null;
      break;
    }
  }
  let body = str(message.text) || str(message.caption);
  if (kind === "LOCATION") {
    const location = record(message.location);
    body = [str(location.latitude), str(location.longitude)].filter(Boolean).join(", ");
  }
  if (kind === "TEXT" && !body) return null;

  const name = [str(from.first_name), str(from.last_name)].filter(Boolean).join(" ") || (from.username ? `@${str(from.username)}` : "");
  return {
    contactId: str(chat.id),
    name,
    body,
    kind,
    providerMessageId: `tg:${str(chat.id)}:${str(message.message_id)}`,
    mediaUrl: null,
    mediaMimeType: mime,
    mediaFilename: filename,
  };
}

// ------------------------------------------------- Messenger & Instagram
// Both use the Messenger Platform: same webhook shape, same Send API, keyed
// by a Page access token. https://developers.facebook.com/docs/messenger-platform

export const META_GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export function metaSendMessage(secrets: Cfg, recipientId: string, text: string): HttpRequest {
  return {
    method: "POST",
    url: `${GRAPH}/me/messages`,
    headers: { Authorization: `Bearer ${secrets.pageAccessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      messaging_type: "RESPONSE",
      // The Send API rejects text over 2000 characters.
      message: { text: text.slice(0, 2000) },
    }),
  };
}

export function metaGetNode(secrets: Cfg, id: string, fields: string): HttpRequest {
  return {
    method: "GET",
    url: `${GRAPH}/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}`,
    headers: { Authorization: `Bearer ${secrets.pageAccessToken}` },
  };
}

/** `X-Hub-Signature-256: sha256=<hmac of the raw body, keyed by the app secret>`. */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string) {
  if (!header || !appSecret) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
  return safeEqual(header.trim(), expected);
}

const META_KINDS: Record<string, InboxMessageKind> = {
  image: "IMAGE",
  video: "VIDEO",
  audio: "AUDIO",
  file: "DOCUMENT",
  location: "LOCATION",
  sticker: "STICKER",
};

/**
 * Every customer message in a Messenger (`object: "page"`) or Instagram
 * (`object: "instagram"`) webhook. Echoes of our own sends, reads, and
 * deliveries are dropped; `ownId` also filters Instagram's self-messages.
 */
export function parseMetaWebhook(payload: unknown, channel: Extract<InboxChannel, "MESSENGER" | "INSTAGRAM">, ownId: string): ParsedChannelMessage[] {
  const body = record(payload);
  const expectedObject = channel === "MESSENGER" ? "page" : "instagram";
  if (body.object !== expectedObject || !Array.isArray(body.entry)) return [];
  const parsed: ParsedChannelMessage[] = [];
  for (const entry of body.entry) {
    const events = record(entry).messaging;
    if (!Array.isArray(events)) continue;
    for (const raw of events) {
      const event = record(raw);
      const message = record(event.message);
      const sender = str(record(event.sender).id);
      if (!message.mid || message.is_echo === true || !sender || sender === ownId) continue;
      const attachments = Array.isArray(message.attachments) ? message.attachments.map(record) : [];
      const first = attachments[0];
      const kind: InboxMessageKind = first ? META_KINDS[str(first.type)] ?? "UNKNOWN" : "TEXT";
      const payloadData = record(first?.payload);
      let text = str(message.text);
      if (!text && kind === "LOCATION") {
        const coords = record(payloadData.coordinates);
        text = [str(coords.lat), str(coords.long)].filter(Boolean).join(", ");
      }
      const url = str(payloadData.url);
      if (!text && kind === "TEXT") continue;
      parsed.push({
        contactId: sender,
        name: "",
        body: text,
        kind,
        providerMessageId: str(message.mid),
        mediaUrl: /^https:\/\//i.test(url) ? url : null,
        mediaMimeType: null,
        mediaFilename: null,
      });
    }
  }
  return parsed;
}

// ----------------------------------------------------------------- Webchat

/** The visitor token is their secret; only its hash is stored and shown. */
export function webchatContactId(visitorToken: string) {
  return `wc_${createHash("sha256").update(visitorToken).digest("hex").slice(0, 32)}`;
}

export function validVisitorToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{24,80}$/.test(value);
}
