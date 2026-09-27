import "server-only";

import { randomUUID } from "node:crypto";
import type { ScheduledJob } from "@prisma/client";

import { JOB_HANDLERS } from "@/lib/jobs/handlers";
import { enqueueJob } from "@/lib/jobs/queue";
import { reportError } from "@/lib/error-reporting";
import { prisma } from "@/lib/prisma";

/**
 * A job stuck in RUNNING past this is assumed dead and re-queued. Exported
 * so the job health dashboard flags the same jobs the runner would reclaim.
 */
export const STALE_LOCK_MS = 10 * 60 * 1000;
const MAX_BACKOFF_MINUTES = 60;

/**
 * The platform-wide sweeps that must keep running on their own. Exported as
 * the single source of truth for what the health dashboard expects to see.
 */
export const RECURRING_JOBS = [
  {
    kind: "WORKSPACE_LIFECYCLE_SWEEP" as const,
    dedupeKey: "workspace-lifecycle-sweep",
    intervalMinutes: 60,
    maxAttempts: 5,
  },
  {
    kind: "AFFILIATE_LIFECYCLE_SWEEP" as const,
    dedupeKey: "affiliate-lifecycle-sweep",
    intervalMinutes: 60,
    maxAttempts: 5,
  },
  {
    kind: "MEMBERSHIP_LIFECYCLE_SWEEP" as const,
    dedupeKey: "membership-lifecycle-sweep",
    intervalMinutes: 60,
    maxAttempts: 5,
  },
  {
    // Menutup periode berbayar, melepas kode unik kadaluarsa, dan mengirim
    // pengingat perpanjangan. Jam-jaman sudah cukup: satuannya hari.
    kind: "SAAS_BILLING_SWEEP" as const,
    dedupeKey: "saas-billing-sweep",
    intervalMinutes: 60,
    maxAttempts: 5,
  },
  {
    kind: "META_CAPI_FLUSH" as const,
    dedupeKey: "meta-capi-flush",
    intervalMinutes: 1,
    maxAttempts: 5,
  },
  {
    kind: "ANALYTICS_ROLLUP" as const,
    dedupeKey: "analytics-rollup",
    intervalMinutes: 60,
    maxAttempts: 3,
  },
  {
    // Daily is often enough: it only deletes history past the retention window.
    kind: "INBOX_PRUNE" as const,
    dedupeKey: "inbox-prune",
    intervalMinutes: 24 * 60,
    maxAttempts: 3,
  },
  {
    kind: "PAYMENT_RECONCILIATION" as const,
    dedupeKey: "payment-reconciliation",
    intervalMinutes: 5,
    maxAttempts: 5,
  },
  {
    // Restocking happens in bursts; a sweep coalesces them into one email each.
    kind: "STOCK_NOTIFY_SWEEP" as const,
    dedupeKey: "stock-notify-sweep",
    intervalMinutes: 15,
    maxAttempts: 3,
  },
  {
    // Runs alongside the expiry sweep, just ahead of it in the buyer's day.
    kind: "PAYMENT_REMINDER_SWEEP" as const,
    dedupeKey: "payment-reminder-sweep",
    intervalMinutes: 15,
    maxAttempts: 3,
  },
  {
    kind: "PAYMENT_EXPIRY_SWEEP" as const,
    dedupeKey: "payment-expiry-sweep",
    intervalMinutes: 5,
    maxAttempts: 5,
  },
  {
    kind: "ABANDONED_CHECKOUT_SWEEP" as const,
    dedupeKey: "abandoned-checkout-sweep",
    intervalMinutes: 10,
    maxAttempts: 5,
  },
  {
    kind: "STORE_NOTIFICATION_RETRY" as const,
    dedupeKey: "store-notification-retry",
    intervalMinutes: 5,
    maxAttempts: 5,
  },
  {
    kind: "FORM_DELIVERY_RETRY" as const,
    dedupeKey: "form-delivery-retry",
    intervalMinutes: 5,
    maxAttempts: 5,
  },
  {
    kind: "LOW_STOCK_ALERT_SWEEP" as const,
    dedupeKey: "low-stock-alert-sweep",
    intervalMinutes: 30,
    maxAttempts: 5,
  },
];

export type RunSummary = {
  claimed: number;
  done: number;
  failed: number;
  retried: number;
  reclaimed: number;
  results: { id: string; kind: string; ok: boolean; detail: string }[];
};

export async function runDueJobs(limit = 25): Promise<RunSummary> {
  const workerId = `${process.pid}-${randomUUID().slice(0, 8)}`;
  const summary: RunSummary = {
    claimed: 0,
    done: 0,
    failed: 0,
    retried: 0,
    reclaimed: 0,
    results: [],
  };

  summary.reclaimed = await reclaimStaleJobs();
  await ensureRecurringJobs();

  const due = await prisma.scheduledJob.findMany({
    where: { status: "PENDING", runAt: { lte: new Date() } },
    orderBy: { runAt: "asc" },
    take: limit,
    select: { id: true },
  });

  for (const candidate of due) {
    const job = await claimJob(candidate.id, workerId);
    if (!job) continue;
    summary.claimed += 1;

    try {
      const handler = JOB_HANDLERS[job.kind];
      const detail = (await handler(job.payload as never, { job, workerId })) ?? "ok";
      await prisma.scheduledJob.update({
        where: { id: job.id },
        data: {
          status: "DONE",
          finishedAt: new Date(),
          lastError: null,
          lockedAt: null,
          lockedBy: null,
        },
      });
      summary.done += 1;
      summary.results.push({ id: job.id, kind: job.kind, ok: true, detail });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown job failure";
      const attempts = job.attempts + 1;
      const exhausted = attempts >= job.maxAttempts;

      await prisma.scheduledJob.update({
        where: { id: job.id },
        data: {
          status: exhausted ? "FAILED" : "PENDING",
          attempts,
          runAt: exhausted ? job.runAt : backoffFrom(attempts),
          lastError: message.slice(0, 1000),
          finishedAt: exhausted ? new Date() : null,
          lockedAt: null,
          lockedBy: null,
        },
      });

      if (exhausted) {
        summary.failed += 1;
        // Retries are routine; a job that has run out of them needs a human.
        reportError(`jobs ${job.kind} failed permanently`, error, {
          context: { jobId: job.id, attempts },
        });
      } else {
        summary.retried += 1;
      }
      summary.results.push({
        id: job.id,
        kind: job.kind,
        ok: false,
        detail: message.slice(0, 200),
      });
      console.warn(`[jobs] ${job.kind} ${job.id} failed:`, message);
    }
  }

  return summary;
}

async function claimJob(
  id: string,
  workerId: string
): Promise<ScheduledJob | null> {
  const claimed = await prisma.scheduledJob.updateMany({
    where: { id, status: "PENDING" },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      lockedAt: new Date(),
      lockedBy: workerId,
    },
  });
  if (claimed.count === 0) return null;
  return prisma.scheduledJob.findUnique({ where: { id } });
}

async function reclaimStaleJobs() {
  const result = await prisma.scheduledJob.updateMany({
    where: {
      status: "RUNNING",
      lockedAt: { lt: new Date(Date.now() - STALE_LOCK_MS) },
    },
    data: { status: "PENDING", lockedAt: null, lockedBy: null },
  });
  return result.count;
}

async function ensureRecurringJobs() {
  for (const recurring of RECURRING_JOBS) {
    const inFlight = await prisma.scheduledJob.findFirst({
      where: {
        kind: recurring.kind,
        status: { in: ["PENDING", "RUNNING"] },
      },
      select: { id: true },
    });
    if (inFlight) continue;

    const last = await prisma.scheduledJob.findFirst({
      where: { kind: recurring.kind, status: { in: ["DONE", "FAILED"] } },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    });
    const runAt = last?.finishedAt
      ? new Date(
          last.finishedAt.getTime() + recurring.intervalMinutes * 60 * 1000
        )
      : new Date();

    await enqueueJob({
      kind: recurring.kind,
      dedupeKey: recurring.dedupeKey,
      maxAttempts: recurring.maxAttempts,
      runAt,
    });
  }
}

function backoffFrom(attempts: number) {
  const minutes = Math.min(2 ** attempts, MAX_BACKOFF_MINUTES);
  return new Date(Date.now() + minutes * 60 * 1000);
}
