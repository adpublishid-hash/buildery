import "server-only";

import type { ScheduledJobKind, ScheduledJobStatus } from "@prisma/client";

import { RECURRING_JOBS, STALE_LOCK_MS } from "@/lib/jobs/runner";
import { prisma } from "@/lib/prisma";

/**
 * Health view over the recurring sweeps.
 *
 * The runner self-heals — a failed sweep is re-queued on the next tick — so
 * the question this answers is not "did one run fail" but "is the worker
 * alive at all". A sweep that is overdue, or locked in RUNNING past the
 * reclaim window, means nothing is ticking and the whole queue is frozen.
 */

/** Worst-first, so the dashboard can sort on it. */
export const JOB_HEALTH_STATES = [
  "STALE",
  "OVERDUE",
  "FAILED",
  "NEVER_RUN",
  "RUNNING",
  "SCHEDULED",
  "OK",
] as const;

export type JobHealthState = (typeof JOB_HEALTH_STATES)[number];

export type JobHealthRow = {
  kind: ScheduledJobKind;
  intervalMinutes: number;
  state: JobHealthState;
  /** The PENDING/RUNNING row, if one is queued. */
  status: ScheduledJobStatus | null;
  runAt: Date | null;
  startedAt: Date | null;
  attempts: number;
  maxAttempts: number;
  /** The most recent finished run, whether it succeeded or not. */
  lastFinishedAt: Date | null;
  lastFinishedStatus: ScheduledJobStatus | null;
  lastError: string | null;
  /** How late the next run is, in minutes. Zero when on time. */
  overdueMinutes: number;
};

export type JobHealthSummary = {
  rows: JobHealthRow[];
  unhealthy: number;
  /** Newest heartbeat across all sweeps — the "is the worker alive" signal. */
  lastActivityAt: Date | null;
  configured: boolean;
};

/**
 * A sweep is late once it is this many times its own interval past due. The
 * multiplier keeps a one-minute sweep from alarming on a slow tick while
 * still catching a thirty-minute sweep that has genuinely stopped.
 */
const OVERDUE_INTERVAL_MULTIPLIER = 3;
/** Floor for the above, so fast sweeps get a usable grace period. */
const MIN_OVERDUE_GRACE_MS = 5 * 60 * 1000;

export async function getJobHealth(
  options: { now?: Date } = {}
): Promise<JobHealthSummary> {
  const now = options.now ?? new Date();
  const kinds = RECURRING_JOBS.map((job) => job.kind);

  const [inFlight, finished] = await Promise.all([
    prisma.scheduledJob.findMany({
      where: { kind: { in: kinds }, status: { in: ["PENDING", "RUNNING"] } },
      orderBy: { runAt: "asc" },
      select: {
        kind: true,
        status: true,
        runAt: true,
        startedAt: true,
        lockedAt: true,
        attempts: true,
        maxAttempts: true,
        lastError: true,
      },
    }),
    prisma.scheduledJob.findMany({
      where: { kind: { in: kinds }, status: { in: ["DONE", "FAILED"] } },
      orderBy: { finishedAt: "desc" },
      // One tick can finish every sweep, so a window a few ticks deep is
      // enough to find the newest run of each without scanning history.
      take: kinds.length * 5,
      select: {
        kind: true,
        status: true,
        finishedAt: true,
        lastError: true,
        attempts: true,
        maxAttempts: true,
      },
    }),
  ]);

  const rows = RECURRING_JOBS.map((recurring) => {
    const queued = inFlight.find((job) => job.kind === recurring.kind) ?? null;
    const last = finished.find((job) => job.kind === recurring.kind) ?? null;
    return buildRow(recurring, queued, last, now);
  });

  const lastActivityAt = rows.reduce<Date | null>((newest, row) => {
    const candidate = row.lastFinishedAt ?? row.startedAt;
    if (!candidate) return newest;
    return !newest || candidate > newest ? candidate : newest;
  }, null);

  return {
    rows,
    unhealthy: rows.filter((row) => isUnhealthy(row.state)).length,
    lastActivityAt,
    // Nothing has ever been queued: either a fresh install, or the runner has
    // never been reached. Either way the dashboard should say so rather than
    // showing six green rows.
    configured: rows.some((row) => row.state !== "NEVER_RUN"),
  };
}

export function isUnhealthy(state: JobHealthState) {
  return state === "STALE" || state === "OVERDUE" || state === "FAILED";
}

type QueuedJob = {
  status: ScheduledJobStatus;
  runAt: Date;
  startedAt: Date | null;
  lockedAt: Date | null;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
};

type FinishedJob = {
  status: ScheduledJobStatus;
  finishedAt: Date | null;
  lastError: string | null;
  attempts: number;
  maxAttempts: number;
};

function buildRow(
  recurring: { kind: ScheduledJobKind; intervalMinutes: number },
  queued: QueuedJob | null,
  last: FinishedJob | null,
  now: Date
): JobHealthRow {
  const base = {
    kind: recurring.kind,
    intervalMinutes: recurring.intervalMinutes,
    status: queued?.status ?? null,
    runAt: queued?.runAt ?? null,
    startedAt: queued?.startedAt ?? null,
    attempts: queued?.attempts ?? last?.attempts ?? 0,
    maxAttempts: queued?.maxAttempts ?? last?.maxAttempts ?? 0,
    lastFinishedAt: last?.finishedAt ?? null,
    lastFinishedStatus: last?.status ?? null,
    lastError: queued?.lastError ?? last?.lastError ?? null,
  };

  // Locked in RUNNING past the reclaim window: the worker that claimed it is
  // gone. This outranks everything else — it is the clearest "worker died".
  if (
    queued?.status === "RUNNING" &&
    queued.lockedAt &&
    now.getTime() - queued.lockedAt.getTime() > STALE_LOCK_MS
  ) {
    return { ...base, state: "STALE", overdueMinutes: 0 };
  }

  if (queued?.status === "RUNNING") {
    return { ...base, state: "RUNNING", overdueMinutes: 0 };
  }

  if (queued?.status === "PENDING") {
    const lateMs = now.getTime() - queued.runAt.getTime();
    const overdueMinutes = Math.max(0, Math.floor(lateMs / 60_000));
    if (lateMs > graceMs(recurring.intervalMinutes)) {
      return { ...base, state: "OVERDUE", overdueMinutes };
    }
    return { ...base, state: "SCHEDULED", overdueMinutes };
  }

  // Nothing queued. The runner re-queues on its next tick, so this only
  // persists when the runner itself is not being called.
  if (!last) return { ...base, state: "NEVER_RUN", overdueMinutes: 0 };
  if (last.status === "FAILED") {
    return { ...base, state: "FAILED", overdueMinutes: 0 };
  }
  return { ...base, state: "OK", overdueMinutes: 0 };
}

function graceMs(intervalMinutes: number) {
  return Math.max(
    MIN_OVERDUE_GRACE_MS,
    intervalMinutes * 60 * 1000 * OVERDUE_INTERVAL_MULTIPLIER
  );
}
