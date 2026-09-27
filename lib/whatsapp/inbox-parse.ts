import type { InboxMessageKind } from "@prisma/client";

/**
 * Turns a provider webhook body into one inbound message.
 *
 * Two shapes are supported: WhatsApp Cloud API (WABA), which nests everything
 * under `entry[].changes[].value`, and the flat JSON the Indonesian gateways
 * (Fonnte, Onesender, Starsender) post. Anything that is not a message — a
 * delivery receipt, a status callback — parses to `null` so the route can
 * acknowledge it instead of failing.
 *
 * Attachments used to be dropped entirely: a customer sending a photo of a
 * damaged parcel produced an empty body and no row at all.
 */

export type ParsedInboxMessage = {
  phone: string;
  name: string;
  /** Text, or an attachment's caption. May be empty for a bare attachment. */
  body: string;
  kind: InboxMessageKind;
  providerMessageId: string;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  mediaFilename: string | null;
};

/** Graph media needs an access token, so its URL is stored but never linked. */
export const GRAPH_MEDIA_HOST = "graph.facebook.com";
const GRAPH_VERSION = "v26.0";

const WABA_KINDS: Record<string, InboxMessageKind> = {
  text: "TEXT",
  image: "IMAGE",
  video: "VIDEO",
  audio: "AUDIO",
  voice: "AUDIO",
  document: "DOCUMENT",
  sticker: "STICKER",
  location: "LOCATION",
};

function str(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function pick(payload: unknown, keys: string[]) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = str(record[key]);
    if (value) return value;
  }
  return "";
}

/** A human label for an attachment that arrived without a caption. */
export function attachmentLabel(kind: InboxMessageKind) {
  switch (kind) {
    case "IMAGE":
      return "[Gambar]";
    case "VIDEO":
      return "[Video]";
    case "AUDIO":
      return "[Pesan suara]";
    case "DOCUMENT":
      return "[Dokumen]";
    case "STICKER":
      return "[Stiker]";
    case "LOCATION":
      return "[Lokasi]";
    case "UNKNOWN":
      return "[Pesan tidak didukung]";
    default:
      return "";
  }
}

function parseWaba(payload: unknown): ParsedInboxMessage | null {
  const entry = (payload as { entry?: unknown[] })?.entry?.[0] as
    | { changes?: unknown[] }
    | undefined;
  const change = entry?.changes?.[0] as
    | { value?: { messages?: unknown[]; contacts?: unknown[] } }
    | undefined;
  const message = change?.value?.messages?.[0] as
    | Record<string, unknown>
    | undefined;
  if (!message) return null;

  const contact = change?.value?.contacts?.[0] as
    | { profile?: { name?: string } }
    | undefined;

  const type = str(message.type) || "text";
  const kind = WABA_KINDS[type] ?? "UNKNOWN";
  const attachment = (message[type] ?? {}) as Record<string, unknown>;

  let body = "";
  if (kind === "TEXT") {
    body = str((message.text as { body?: string } | undefined)?.body);
  } else if (kind === "LOCATION") {
    const name = str(attachment.name) || str(attachment.address);
    const coords = [str(attachment.latitude), str(attachment.longitude)]
      .filter(Boolean)
      .join(", ");
    body = [name, coords].filter(Boolean).join(" — ");
  } else {
    body = str(attachment.caption);
  }

  // Interactive replies and buttons carry their text somewhere else entirely.
  if (!body && type === "button") {
    body = str((message.button as { text?: string } | undefined)?.text);
  }
  if (!body && type === "interactive") {
    const interactive = message.interactive as Record<string, unknown> | undefined;
    const reply = (interactive?.button_reply ?? interactive?.list_reply) as
      | { title?: string }
      | undefined;
    body = str(reply?.title);
  }

  const mediaId = str(attachment.id);
  return {
    phone: str(message.from),
    name: contact?.profile?.name ?? "",
    body,
    kind: body && kind === "UNKNOWN" ? "TEXT" : kind,
    providerMessageId: str(message.id),
    // The Cloud API hands over an id, not a link; this is where it is fetched
    // from, with the workspace's token.
    mediaUrl: mediaId
      ? `https://${GRAPH_MEDIA_HOST}/${GRAPH_VERSION}/${mediaId}`
      : null,
    mediaMimeType: str(attachment.mime_type) || null,
    mediaFilename: str(attachment.filename) || null,
  };
}

function parseFlat(payload: unknown): ParsedInboxMessage | null {
  const phone = pick(payload, ["from", "phone", "sender", "number", "wa_number"]);
  const body = pick(payload, ["message", "text", "body", "caption"]);
  const mediaUrl = pick(payload, [
    "mediaUrl",
    "media_url",
    "url",
    "fileUrl",
    "file_url",
    "image",
  ]);
  if (!phone || (!body && !mediaUrl)) return null;

  const mime = pick(payload, ["mimeType", "mime_type", "mimetype", "type"]);
  return {
    phone,
    name: pick(payload, ["name", "pushName", "senderName", "contact_name"]),
    body,
    kind: mediaUrl ? kindFromMime(mime, mediaUrl) : "TEXT",
    providerMessageId: pick(payload, ["messageId", "id", "msgId"]),
    mediaUrl: /^https?:\/\//i.test(mediaUrl) ? mediaUrl : null,
    mediaMimeType: mime.includes("/") ? mime : null,
    mediaFilename: pick(payload, ["filename", "fileName", "file_name"]) || null,
  };
}

function kindFromMime(mime: string, url: string): InboxMessageKind {
  const probe = `${mime} ${url}`.toLowerCase();
  if (/^image\/|\.(jpe?g|png|gif|webp)(\?|$)/.test(probe)) return "IMAGE";
  if (/^video\/|\.(mp4|mov|3gp|webm)(\?|$)/.test(probe)) return "VIDEO";
  if (/^audio\/|\.(mp3|ogg|opus|m4a|wav)(\?|$)/.test(probe)) return "AUDIO";
  if (/^application\/|\.(pdf|docx?|xlsx?|pptx?|zip)(\?|$)/.test(probe)) return "DOCUMENT";
  return "UNKNOWN";
}

export function parseInboxWebhook(payload: unknown): ParsedInboxMessage | null {
  const waba = parseWaba(payload);
  if (waba?.phone && (waba.body || waba.mediaUrl || waba.kind !== "TEXT")) {
    return waba;
  }
  return parseFlat(payload);
}
