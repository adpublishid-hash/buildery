import "server-only";

import { sendQueuedChannelMessage } from "@/lib/integrations/inbox/channels";
import { prisma } from "@/lib/prisma";
import { getWorkspaceWhatsAppConfig, sendWhatsAppText } from "@/lib/whatsapp/send";

/**
 * Delivers one queued outbound InboxMessage that an operator wrote — an inbox
 * reply or a follow-up — to the workspace's WhatsApp provider.
 *
 * Those messages used to stop at the database: the row said QUEUED (with a
 * sentAt, as if delivered) and nothing ever sent it. Automatic order, refund
 * and recovery notices are not sent here; they go out through the
 * StoreNotification retry sweep, and sending their inbox copy too would
 * deliver them twice.
 */
export async function sendQueuedInboxWhatsAppMessage(messageId: string): Promise<string> {
  const message = await prisma.inboxMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      workspaceId: true,
      status: true,
      direction: true,
      body: true,
      conversation: { select: { contactPhone: true, channel: true } },
    },
  });

  if (!message) return "message no longer exists";
  if (message.direction !== "OUTBOUND") return "not an outbound message";
  // SENT or FAILED means it was already resolved; never send twice.
  if (message.status !== "QUEUED") return `already ${message.status}`;

  // Telegram, Messenger and Instagram replies share this job.
  if (message.conversation.channel !== "WHATSAPP") return sendQueuedChannelMessage(message);

  const config = await getWorkspaceWhatsAppConfig(message.workspaceId);
  if (!config) {
    await markFailed(message.id, "WhatsApp belum aktif di Settings > Integrasi.");
    return "workspace has WhatsApp switched off";
  }

  const result = await sendWhatsAppText(config, message.conversation.contactPhone, message.body);

  if (result.ok) {
    await prisma.inboxMessage.update({
      where: { id: message.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        provider: config.provider,
        providerMessageId: result.providerMessageId,
        errorMessage: null,
      },
    });
    return `sent via ${config.provider}`;
  }

  if (result.permanent) {
    // Bad credentials or an unusable number: retrying changes nothing.
    await markFailed(message.id, result.error);
    return `permanent failure: ${result.error}`;
  }

  // Transient (network, timeout, provider 5xx/429): keep it QUEUED and throw so
  // the runner retries with backoff. The last attempt's error stays visible.
  await prisma.inboxMessage.update({
    where: { id: message.id },
    data: { provider: config.provider, errorMessage: result.error.slice(0, 500) },
  });
  throw new Error(result.error);
}

/**
 * Called when the runner gives up on a transient failure, so the operator sees
 * FAILED instead of a message that looks queued forever.
 */
export async function markInboxWhatsAppMessageFailed(messageId: string, error: string) {
  await prisma.inboxMessage.updateMany({
    where: { id: messageId, status: "QUEUED" },
    data: { status: "FAILED", sentAt: null, errorMessage: error.slice(0, 500) },
  });
}

async function markFailed(messageId: string, error: string) {
  await prisma.inboxMessage.update({
    where: { id: messageId },
    data: { status: "FAILED", sentAt: null, errorMessage: error.slice(0, 500) },
  });
}
