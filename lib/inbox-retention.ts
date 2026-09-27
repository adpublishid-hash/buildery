import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Trims inbox history.
 *
 * `InboxMessage` had nothing pruning it — a busy store's WhatsApp traffic grows
 * without limit. Only dormant conversations are trimmed: a thread the customer
 * or an operator has touched inside the retention window keeps every message,
 * however old some of them are. The conversation row itself is always kept, so
 * the contact, its labels, notes and last preview survive.
 */

export const INBOX_RETENTION_DAYS = Number(
  process.env.INBOX_RETENTION_DAYS || 365
);

const DAY_MS = 24 * 60 * 60 * 1000;

export type InboxPruneSummary = { messages: number; conversations: number };

export async function pruneInboxMessages(
  options: { now?: Date; retentionDays?: number } = {}
): Promise<InboxPruneSummary> {
  const retentionDays = options.retentionDays ?? INBOX_RETENTION_DAYS;
  // A non-positive retention would delete everything; treat it as "disabled".
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    return { messages: 0, conversations: 0 };
  }

  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);

  const dormant = await prisma.inboxConversation.findMany({
    where: {
      OR: [{ lastMessageAt: { lt: cutoff } }, { lastMessageAt: null }],
      messages: { some: { createdAt: { lt: cutoff } } },
    },
    select: { id: true },
    take: 500,
  });
  if (dormant.length === 0) return { messages: 0, conversations: 0 };

  const deleted = await prisma.inboxMessage.deleteMany({
    where: {
      conversationId: { in: dormant.map((row) => row.id) },
      createdAt: { lt: cutoff },
    },
  });

  return { messages: deleted.count, conversations: dormant.length };
}
