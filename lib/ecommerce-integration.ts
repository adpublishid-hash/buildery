import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { enqueueJob } from "@/lib/jobs/queue";

type Tx = Prisma.TransactionClient | PrismaClient;

function normalizePhone(input: string) {
  const plus = input.trim().startsWith("+") ? "+" : "";
  const digits = input.replace(/\D/g, "");
  return `${plus}${digits}`;
}

export async function queueWhatsAppInboxMessage(
  tx: Tx,
  input: {
    workspaceId: string;
    customerId?: string | null;
    contactName?: string | null;
    contactPhone?: string | null;
    body: string;
    /**
     * Send it, instead of only recording it. Set by operator-written messages
     * (follow-ups). Leave unset for automatic notices: those are delivered by
     * the StoreNotification retry sweep, and the inbox row is their log.
     */
    deliver?: boolean;
  }
) {
  if (!input.contactPhone || !input.body.trim()) return null;
  const contactPhone = normalizePhone(input.contactPhone);
  if (!contactPhone) return null;

  const integration = await tx.integrationSetting.findUnique({
    where: { workspaceId: input.workspaceId },
    select: { whatsappIsActive: true, whatsappProvider: true },
  });

  const conversation = await tx.inboxConversation.upsert({
    where: {
      workspaceId_channel_contactPhone: {
        workspaceId: input.workspaceId,
        channel: "WHATSAPP",
        contactPhone,
      },
    },
    update: {
      customerId: input.customerId ?? undefined,
      contactName: input.contactName ?? undefined,
      status: "PENDING",
      lastMessagePreview: input.body.trim().slice(0, 140),
      lastMessageAt: new Date(),
      unreadCount: 0,
    },
    create: {
      workspaceId: input.workspaceId,
      customerId: input.customerId ?? null,
      channel: "WHATSAPP",
      contactPhone,
      contactName: input.contactName ?? null,
      status: "PENDING",
      lastMessagePreview: input.body.trim().slice(0, 140),
      lastMessageAt: new Date(),
      unreadCount: 0,
    },
  });

  const message = await tx.inboxMessage.create({
    data: {
      workspaceId: input.workspaceId,
      conversationId: conversation.id,
      direction: "OUTBOUND",
      status: integration?.whatsappIsActive ? "QUEUED" : "FAILED",
      provider: integration?.whatsappProvider ?? null,
      body: input.body.trim(),
      // A delivered message gets its sentAt from the send job, not here.
      sentAt: integration?.whatsappIsActive && !input.deliver ? new Date() : null,
      errorMessage: integration?.whatsappIsActive
        ? null
        : "Aktifkan provider WhatsApp di Settings > Integrasi sebelum mengirim.",
    },
  });

  if (input.deliver && integration?.whatsappIsActive) {
    await enqueueJob(
      {
        kind: "WHATSAPP_SEND",
        workspaceId: input.workspaceId,
        payload: { messageId: message.id },
        dedupeKey: `whatsapp-send:${message.id}`,
      },
      tx
    );
  }

  return conversation;
}
