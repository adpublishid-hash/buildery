import "server-only";

import { prisma } from "@/lib/prisma";
import { sendWorkspaceTelegramMessage } from "@/lib/telegram";

/**
 * Tells the team a customer wrote in.
 *
 * Inbound messages arrive by webhook, so without this nobody knows until they
 * happen to open the inbox. Telegram is the channel the workspace already uses
 * for internal order and form alerts.
 *
 * Throttled per conversation: a customer typing five lines in a row is one
 * alert, not five.
 */

/** Matches how the other internal alerts (low stock, ad tokens) build links. */
function dashboardBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

export const NOTIFY_THROTTLE_MINUTES = Number(
  process.env.INBOX_NOTIFY_THROTTLE_MINUTES || 10
);

export async function notifyInboxConversation(
  conversationId: string,
  options: { now?: Date } = {}
): Promise<string> {
  const now = options.now ?? new Date();

  const conversation = await prisma.inboxConversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      workspaceId: true,
      contactName: true,
      contactPhone: true,
      lastMessagePreview: true,
      unreadCount: true,
      notifiedAt: true,
      assignedTo: { select: { name: true, email: true } },
      workspace: { select: { name: true } },
    },
  });
  if (!conversation) return "conversation no longer exists";

  // Already read by the time the job ran: the operator is looking at it.
  if (conversation.unreadCount <= 0) return "already read";

  if (
    conversation.notifiedAt &&
    now.getTime() - conversation.notifiedAt.getTime() <
      NOTIFY_THROTTLE_MINUTES * 60 * 1000
  ) {
    return "throttled";
  }

  const who =
    conversation.contactName?.trim() || conversation.contactPhone;
  const assigned = conversation.assignedTo
    ? `\nPetugas: ${conversation.assignedTo.name ?? conversation.assignedTo.email}`
    : "";
  const text = [
    `💬 Pesan WhatsApp baru — ${conversation.workspace.name}`,
    "",
    `Dari: ${who} (${conversation.contactPhone})`,
    `Belum dibaca: ${conversation.unreadCount}`,
    conversation.lastMessagePreview ? `\n"${conversation.lastMessagePreview}"` : "",
    assigned,
    "",
    `${dashboardBaseUrl()}/dashboard/inbox?c=${conversation.id}`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const result = await sendWorkspaceTelegramMessage(conversation.workspaceId, text);

  // Stamp only on success, so a workspace that turns Telegram on later still
  // gets alerted about the conversation that is already waiting.
  if (result.ok) {
    await prisma.inboxConversation.update({
      where: { id: conversation.id },
      data: { notifiedAt: now },
    });
    return "notified via telegram";
  }

  return `not sent: ${result.error}`;
}
