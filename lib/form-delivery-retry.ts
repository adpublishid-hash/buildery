import "server-only";

import { prisma } from "@/lib/prisma";
import {
  FORM_DELIVERY_MAX_ATTEMPTS,
  performDelivery,
  recordDeliveryOutcome,
  submissionDeliverySnapshot,
} from "@/lib/form-delivery";

/**
 * Safety net for form notifications.
 *
 * Two kinds of row end up here. A FAILED row whose backoff has elapsed is the
 * obvious one. The other is a row still marked PENDING long after it was
 * created: the request that should have sent it died — a deploy, a PM2
 * reload, a crash — and without this sweep that lead would never be
 * delivered and nobody would ever know.
 */

/** A PENDING row older than this was abandoned mid-send, not just started. */
const STALE_PENDING_MINUTES = 5;

export type FormDeliveryRetrySummary = {
  scanned: number;
  sent: number;
  failed: number;
  skipped: number;
};

export async function retryFormDeliveries(
  options: { limit?: number; now?: Date } = {}
): Promise<FormDeliveryRetrySummary> {
  const now = options.now ?? new Date();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const stalePendingCutoff = new Date(
    now.getTime() - STALE_PENDING_MINUTES * 60 * 1000
  );

  const due = await prisma.formDelivery.findMany({
    where: {
      attempts: { lt: FORM_DELIVERY_MAX_ATTEMPTS },
      AND: [
        {
          OR: [
            { status: "FAILED", nextAttemptAt: { lte: now } },
            { status: "PENDING", createdAt: { lte: stalePendingCutoff } },
          ],
        },
      ],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: {
      id: true,
      kind: true,
      target: true,
      attempts: true,
      status: true,
      submissionId: true,
    },
  });

  const summary: FormDeliveryRetrySummary = {
    scanned: due.length,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  for (const row of due) {
    // Claim it by clearing the schedule, conditioned on the state we read.
    // Another worker that got here first changes one of these, so its
    // updateMany wins and ours matches nothing.
    const claim = await prisma.formDelivery.updateMany({
      where: { id: row.id, status: row.status, attempts: row.attempts },
      data: { nextAttemptAt: null, lastTriedAt: now },
    });
    if (claim.count !== 1) {
      summary.skipped += 1;
      continue;
    }

    const submission = await prisma.formSubmission.findUnique({
      where: { id: row.submissionId },
      include: {
        form: { include: { fields: { orderBy: { order: "asc" } } } },
        formVersion: true,
        workspace: { select: { name: true } },
      },
    });
    if (!submission) {
      // The submission was deleted under us; the cascade will take the row.
      summary.skipped += 1;
      continue;
    }

    const result = await performDelivery(
      row,
      submissionDeliverySnapshot(submission),
      submission.workspace.name
    );
    await recordDeliveryOutcome(row, result, now);
    if (result.ok) summary.sent += 1;
    else summary.failed += 1;
  }

  return summary;
}
