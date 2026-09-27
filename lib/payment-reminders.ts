import "server-only";

import { prisma } from "@/lib/prisma";
import { queueOrderNotifications } from "@/lib/store-notifications";

/**
 * Nudges buyers whose payment window is closing.
 *
 * A pending order simply lapsed at the payment timeout — 24 hours by default —
 * and the first the buyer heard of it was nothing at all. One reminder per
 * payment, a few hours before the deadline.
 *
 * COD orders carry no expiry, so they are never in scope: there is no deadline
 * to warn about.
 */

export const REMINDER_LEAD_HOURS = Number(
  process.env.PAYMENT_REMINDER_LEAD_HOURS || 3
);
/** Guards against a backlog sending hundreds of emails in one tick. */
const MAX_PER_RUN = 100;

export type ReminderSummary = { reminded: number };

export async function sweepPaymentReminders(
  options: { now?: Date; leadHours?: number } = {}
): Promise<ReminderSummary> {
  const now = options.now ?? new Date();
  const leadHours = options.leadHours ?? REMINDER_LEAD_HOURS;
  if (!Number.isFinite(leadHours) || leadHours <= 0) return { reminded: 0 };

  const deadline = new Date(now.getTime() + leadHours * 60 * 60 * 1000);

  const due = await prisma.payment.findMany({
    where: {
      kind: "ORDER",
      status: "PENDING",
      remindedAt: null,
      orderId: { not: null },
      // Already past its window: the expiry sweep will cancel it, and a
      // reminder to pay something that is about to be void is worse than none.
      expiresAt: { gt: now, lte: deadline },
    },
    select: { id: true, orderId: true },
    orderBy: { expiresAt: "asc" },
    take: MAX_PER_RUN,
  });

  let reminded = 0;
  for (const payment of due) {
    if (!payment.orderId) continue;
    try {
      await prisma.$transaction(async (tx) => {
        // Claim it first: two overlapping sweeps must not both send.
        const claimed = await tx.payment.updateMany({
          where: { id: payment.id, remindedAt: null, status: "PENDING" },
          data: { remindedAt: now },
        });
        if (claimed.count !== 1) return;

        await queueOrderNotifications(tx, payment.orderId!, "PAYMENT_REMINDER");
        reminded += 1;
      });
    } catch (error) {
      // One bad order must not stop the rest of the sweep.
      console.warn(`[payment-reminder] order ${payment.orderId} failed:`, error);
    }
  }

  return { reminded };
}
