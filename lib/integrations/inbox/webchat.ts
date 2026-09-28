import "server-only";

import { receiveInboxMessage } from "@/lib/actions/inbox";
import { prisma } from "@/lib/prisma";

import { getConnectionByWebhookKey, recordInboundEvent } from "../connections";
import { validVisitorToken, webchatContactId } from "./requests";

/**
 * The public side of web chat. A visitor is identified only by a random token
 * their browser keeps; it is their key to their own thread, so it is never
 * stored or shown, only its hash (the conversation's contact id).
 */

export const WEBCHAT_MAX_LENGTH = 2000;

export async function loadWebchat(key: string) {
  const connection = await getConnectionByWebhookKey("webchat", key);
  return connection?.enabled ? connection : null;
}

export function webchatSettings(config: Record<string, string>) {
  return {
    greeting: (config.greeting || "Hi! How can we help?").slice(0, 200),
    accentColor: /^#[0-9a-f]{3,8}$/i.test(config.accentColor ?? "") ? config.accentColor : "#111827",
    position: config.position === "left" ? "left" : "right",
  };
}

export type WebchatMessage = { id: string; from: "visitor" | "agent"; body: string; at: string };

export async function listVisitorMessages(workspaceId: string, visitorToken: string, after: Date | null): Promise<WebchatMessage[]> {
  const conversation = await prisma.inboxConversation.findUnique({
    where: {
      workspaceId_channel_contactPhone: { workspaceId, channel: "WEBCHAT", contactPhone: webchatContactId(visitorToken) },
    },
    select: { id: true },
  });
  if (!conversation) return [];
  const rows = await prisma.inboxMessage.findMany({
    where: {
      conversationId: conversation.id,
      // Replies still queued or that failed are the operator's business.
      OR: [{ direction: "INBOUND" }, { direction: "OUTBOUND", status: "SENT" }],
      ...(after ? { createdAt: { gt: after } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, direction: true, body: true, createdAt: true },
  });
  return rows.reverse().map((row) => ({
    id: row.id,
    from: row.direction === "INBOUND" ? "visitor" : "agent",
    body: row.body,
    at: row.createdAt.toISOString(),
  }));
}

export type VisitorPost =
  | { ok: true }
  | { ok: false; status: number; error: string };

export async function postVisitorMessage(
  connection: { id: string; workspaceId: string },
  input: { token: unknown; text: unknown; name?: unknown; email?: unknown; clientId?: unknown }
): Promise<VisitorPost> {
  if (!validVisitorToken(input.token)) return { ok: false, status: 400, error: "Invalid visitor token." };
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!text) return { ok: false, status: 400, error: "Message is empty." };
  if (text.length > WEBCHAT_MAX_LENGTH) return { ok: false, status: 400, error: "Message is too long." };
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
  const email = typeof input.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) ? input.email.trim() : null;
  const clientId = typeof input.clientId === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(input.clientId) ? input.clientId : null;

  await receiveInboxMessage({
    workspaceId: connection.workspaceId,
    channel: "WEBCHAT",
    phone: webchatContactId(input.token),
    name: name || null,
    email,
    body: text,
    // A double-submitted message (flaky network, retry) is stored once.
    providerMessageId: clientId ? `webchat:${webchatContactId(input.token)}:${clientId}` : null,
    provider: null,
  });
  await recordInboundEvent(connection.id).catch(() => {});
  return { ok: true };
}
