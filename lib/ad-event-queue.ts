import "server-only";

import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

import { enqueueJob } from "@/lib/jobs/queue";
import { prisma } from "@/lib/prisma";

/**
 * The delivery queue shared by every server-side ad platform.
 *
 * An event is written as a row (cheap, no HTTP on the buyer's request) and the
 * META_CAPI_FLUSH job sends due rows per workspace per provider in batches.
 * What differs between Meta and TikTok — config, payload shape, endpoint,
 * error codes, batch size — lives in a provider adapter; the rules below are
 * the same for both:
 *
 * - A permanent rejection of a batch may be caused by one bad event, and both
 *   platforms reject the whole batch for it. The batch is split in half until
 *   the bad event is isolated, so one row cannot sink a thousand.
 * - Transient failures (timeout, 5xx, 429) retry the batch whole, with backoff.
 * - Events past the platform's age limit are dropped before sending, or a
 *   backlog after an outage would get every batch rejected forever.
 */

export type AdProvider = "META" | "TIKTOK" | "GA4";

const QUEUE_EVENT_MAX_ATTEMPTS = 60;
const QUEUE_MAX_BACKOFF_MINUTES = 60;
const QUEUE_RETENTION_DAYS = 14;
const FLUSH_POKE_INTERVAL_MS = 10_000;

type Tx = Prisma.TransactionClient | PrismaClient;

export type AdSendFailureKind =
  | "timeout"
  | "network"
  | "rate_limited"
  | "server"
  | "auth"
  | "client";

export type AdSendFailure = {
  ok: false;
  retryable: boolean;
  kind: AdSendFailureKind;
  status?: number;
  code?: number;
  error: string;
  body?: string;
};

export type AdSendResult = { ok: true; eventsReceived?: number } | AdSendFailure;

export type AdQueueResult =
  | { queued: true; id: string }
  | { queued: false; reason: "disabled" | "duplicate" | "unsupported" };

export type AdFlushSummary = {
  workspaces: number;
  sent: number;
  failed: number;
  retrying: number;
  staleDropped: number;
  discarded: number;
};

export type AdDeliveryStatus = {
  pending: number;
  sentToday: number;
  failedToday: number;
  staleDroppedToday: number;
  sent7d: number;
  failed7d: number;
  tokenErrors7d: number;
  lastError: string | null;
  lastFailureAt: string | null;
};

export type AdQueueAdapter<Config, Payload> = {
  provider: AdProvider;
  /** Human label for error messages, e.g. "Meta CAPI". */
  label: string;
  maxBatchSize: number;
  maxEventAgeSeconds: number;
  /** `target` is "" for the primary pixel, or an extra pixel's id. */
  getConfig(workspaceId: string, target: string): Promise<Config | null>;
  /** Re-validates a stored payload; null marks the row as permanently failed. */
  readPayload(value: Prisma.JsonValue): Payload | null;
  eventTimeSeconds(payload: Payload): number;
  sendBatch(config: Config, events: Payload[]): Promise<AdSendResult>;
  /** Whether a failure means the stored access token is no longer valid. */
  isTokenError(failure: AdSendFailure): boolean;
};

type QueuedRow = {
  id: string;
  workspaceId: string;
  payload: Prisma.JsonValue;
  attempts: number;
};

let nextFlushPokeAt = 0;
let flushPokePromise: Promise<void> | null = null;

export function clearAdEventFlushPokeCache() {
  nextFlushPokeAt = 0;
  flushPokePromise = null;
}

export async function queueAdEvent(input: {
  provider: AdProvider;
  workspaceId: string;
  /** "" (the default) is the primary pixel; otherwise an extra pixel's id. */
  target?: string;
  eventName: string;
  eventId: string;
  payload: Prisma.InputJsonValue;
}): Promise<AdQueueResult> {
  let row: { id: string };
  try {
    row = await prisma.metaCapiEvent.create({
      data: {
        workspaceId: input.workspaceId,
        provider: input.provider,
        target: input.target ?? "",
        eventName: input.eventName,
        eventId: input.eventId,
        payload: input.payload,
      },
      select: { id: true },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { queued: false, reason: "duplicate" };
    }
    throw error;
  }
  await enqueueAdEventFlushJob();
  return { queued: true, id: row.id };
}

export async function flushAdEventQueue<Config, Payload>(
  adapter: AdQueueAdapter<Config, Payload>,
  options: { workspaceLimit?: number; batchSize?: number } = {}
): Promise<AdFlushSummary> {
  const workspaceLimit = options.workspaceLimit ?? 50;
  const batchSize = Math.min(
    options.batchSize ?? adapter.maxBatchSize,
    adapter.maxBatchSize
  );
  const summary: AdFlushSummary = {
    workspaces: 0,
    sent: 0,
    failed: 0,
    retrying: 0,
    staleDropped: 0,
    discarded: 0,
  };
  const now = new Date();
  const dueWhere = {
    provider: adapter.provider,
    sentAt: null,
    failedAt: null,
    OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
  } satisfies Prisma.MetaCapiEventWhereInput;

  // One batch per pixel: each pixel has its own id and token, so rows for
  // different pixels of one workspace can never share a request.
  const groups = await prisma.metaCapiEvent.findMany({
    where: dueWhere,
    distinct: ["workspaceId", "target"],
    orderBy: { createdAt: "asc" },
    take: workspaceLimit,
    select: { workspaceId: true, target: true },
  });

  const seenWorkspaces = new Set<string>();
  for (const { workspaceId, target } of groups) {
    if (!seenWorkspaces.has(workspaceId)) {
      seenWorkspaces.add(workspaceId);
      summary.workspaces += 1;
    }
    const rows = await prisma.metaCapiEvent.findMany({
      where: { ...dueWhere, workspaceId, target },
      orderBy: { createdAt: "asc" },
      take: batchSize,
      select: { id: true, workspaceId: true, payload: true, attempts: true },
    });
    if (rows.length === 0) continue;

    const config = await adapter.getConfig(workspaceId, target);
    if (!config) {
      // Switched off since the events were queued: the operator asked for no
      // more data to go out, so pending rows are discarded, not sent.
      await prisma.metaCapiEvent.deleteMany({
        where: { id: { in: rows.map((row) => row.id) } },
      });
      summary.discarded += rows.length;
      continue;
    }

    const cutoff = Math.floor(Date.now() / 1000) - adapter.maxEventAgeSeconds;
    const staleRows = rows.filter((row) => {
      const payload = adapter.readPayload(row.payload);
      return payload ? adapter.eventTimeSeconds(payload) < cutoff : false;
    });
    if (staleRows.length > 0) {
      await markRowsFailed(
        adapter.provider,
        staleRows,
        `${adapter.label} event older than the platform accepts.`,
        { staleDropped: true }
      );
      summary.staleDropped += staleRows.length;
    }

    const staleIds = new Set(staleRows.map((row) => row.id));
    await deliverRows(
      adapter,
      rows.filter((row) => !staleIds.has(row.id)),
      config,
      summary
    );
  }

  return summary;
}

export async function pruneAdEvents(olderThanDays = QUEUE_RETENTION_DAYS) {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const result = await prisma.metaCapiEvent.deleteMany({
    where: { OR: [{ sentAt: { lt: cutoff } }, { failedAt: { lt: cutoff } }] },
  });
  return result.count;
}

export async function getWorkspaceAdDeliveryStatus(
  workspaceId: string,
  provider: AdProvider
): Promise<AdDeliveryStatus> {
  const now = new Date();
  const today = startOfUtcDay(now);
  const sevenDaysAgo = startOfUtcDay(
    new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)
  );

  const [pending, stats, latestFailure] = await Promise.all([
    prisma.metaCapiEvent.count({
      where: { workspaceId, provider, sentAt: null, failedAt: null },
    }),
    prisma.metaCapiDailyStat.findMany({
      where: { workspaceId, provider, day: { gte: sevenDaysAgo } },
      orderBy: { day: "desc" },
    }),
    prisma.metaCapiDailyStat.findFirst({
      where: { workspaceId, provider, lastFailureAt: { not: null } },
      orderBy: { lastFailureAt: "desc" },
      select: { lastError: true, lastFailureAt: true },
    }),
  ]);

  const todayStats = stats.find((item) => item.day.getTime() === today.getTime());
  return {
    pending,
    sentToday: todayStats?.sent ?? 0,
    failedToday: todayStats?.failed ?? 0,
    staleDroppedToday: todayStats?.staleDropped ?? 0,
    sent7d: stats.reduce((sum, item) => sum + item.sent, 0),
    failed7d: stats.reduce((sum, item) => sum + item.failed, 0),
    tokenErrors7d: stats.reduce((sum, item) => sum + item.tokenErrors, 0),
    lastError: latestFailure?.lastError ?? null,
    lastFailureAt: latestFailure?.lastFailureAt?.toISOString() ?? null,
  };
}

export function describeAdSendFailure(result: AdSendFailure) {
  const status = result.status ? `HTTP ${result.status}` : result.kind;
  const code = result.code ? ` code ${result.code}` : "";
  return `${status}${code}: ${result.error}`.slice(0, 1000);
}

async function deliverRows<Config, Payload>(
  adapter: AdQueueAdapter<Config, Payload>,
  rows: QueuedRow[],
  config: Config,
  summary: AdFlushSummary
) {
  if (rows.length === 0) return;

  const valid: Array<QueuedRow & { parsed: Payload }> = [];
  const invalid: QueuedRow[] = [];
  for (const row of rows) {
    const parsed = adapter.readPayload(row.payload);
    if (parsed) valid.push({ ...row, parsed });
    else invalid.push(row);
  }

  if (invalid.length > 0) {
    await markRowsFailed(
      adapter.provider,
      invalid,
      `Queued ${adapter.label} payload is invalid.`,
      { countAsFailed: true }
    );
    summary.failed += invalid.length;
  }
  if (valid.length === 0) return;

  const result = await adapter.sendBatch(
    config,
    valid.map((row) => row.parsed)
  );
  if (result.ok) {
    await markRowsSent(adapter.provider, valid);
    summary.sent += valid.length;
    return;
  }

  const error = describeAdSendFailure(result);
  if (result.retryable) {
    const outcome = await markRowsRetrying(adapter.provider, valid, error);
    summary.retrying += outcome.retrying;
    summary.failed += outcome.failed;
    return;
  }

  // A rejected credential fails every event alike; splitting would only
  // repeat the same rejection log2(n) times.
  if (result.kind === "auth") {
    await markRowsFailed(adapter.provider, valid, error, {
      countAsFailed: true,
      tokenError: adapter.isTokenError(result),
    });
    summary.failed += valid.length;
    return;
  }

  if (valid.length === 1) {
    await markRowsFailed(adapter.provider, valid, error, { countAsFailed: true });
    summary.failed += 1;
    return;
  }

  const midpoint = Math.ceil(valid.length / 2);
  await deliverRows(adapter, valid.slice(0, midpoint), config, summary);
  await deliverRows(adapter, valid.slice(midpoint), config, summary);
}

async function markRowsSent(provider: AdProvider, rows: QueuedRow[]) {
  if (rows.length === 0) return;
  await prisma.metaCapiEvent.updateMany({
    where: { id: { in: rows.map((row) => row.id) } },
    data: { sentAt: new Date(), nextAttemptAt: null, lastError: null },
  });
  await recordDailyStat(rows[0].workspaceId, provider, { sent: rows.length });
}

async function markRowsRetrying(
  provider: AdProvider,
  rows: QueuedRow[],
  error: string
) {
  const retrying = rows.filter((row) => row.attempts + 1 < QUEUE_EVENT_MAX_ATTEMPTS);
  const exhausted = rows.filter((row) => row.attempts + 1 >= QUEUE_EVENT_MAX_ATTEMPTS);

  // Rows with the same attempt count share a next-attempt time, so they are
  // updated together rather than one statement per row.
  const groups = new Map<number, { nextAttemptAt: Date; ids: string[] }>();
  for (const row of retrying) {
    const nextAttemptAt = nextAttemptAtFor(row.attempts + 1);
    const key = nextAttemptAt.getTime();
    const group = groups.get(key) ?? { nextAttemptAt, ids: [] };
    group.ids.push(row.id);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    await prisma.metaCapiEvent.updateMany({
      where: { id: { in: group.ids } },
      data: {
        attempts: { increment: 1 },
        nextAttemptAt: group.nextAttemptAt,
        lastError: error.slice(0, 1000),
      },
    });
  }

  if (exhausted.length > 0) {
    await markRowsFailed(provider, exhausted, error, { countAsFailed: true });
  }
  return { retrying: retrying.length, failed: exhausted.length };
}

function nextAttemptAtFor(attempts: number) {
  const minutes = Math.min(2 ** Math.max(0, attempts), QUEUE_MAX_BACKOFF_MINUTES);
  return new Date(Date.now() + minutes * 60 * 1000);
}

async function markRowsFailed(
  provider: AdProvider,
  rows: QueuedRow[],
  error: string,
  options: { countAsFailed?: boolean; staleDropped?: boolean; tokenError?: boolean } = {}
) {
  if (rows.length === 0) return;
  const now = new Date();
  await prisma.metaCapiEvent.updateMany({
    where: { id: { in: rows.map((row) => row.id) } },
    data: {
      failedAt: now,
      nextAttemptAt: null,
      attempts: { increment: 1 },
      lastError: error.slice(0, 1000),
    },
  });
  await recordDailyStat(rows[0].workspaceId, provider, {
    failed: options.countAsFailed ? rows.length : 0,
    staleDropped: options.staleDropped ? rows.length : 0,
    tokenErrors: options.tokenError ? rows.length : 0,
    lastError: error,
    lastFailureAt: now,
  });
  if (options.tokenError) {
    // Loaded lazily: the queue stays free of email and Telegram dependencies
    // until an alert is actually needed.
    import("@/lib/ad-token-alert")
      .then(({ alertAdTokenRejected }) =>
        alertAdTokenRejected({
          workspaceId: rows[0].workspaceId,
          provider,
          day: startOfUtcDay(now),
          error,
        })
      )
      .catch((alertError) => {
        console.warn("Ad token alert failed", alertError);
      });
  }
}

async function recordDailyStat(
  workspaceId: string,
  provider: AdProvider,
  input: {
    sent?: number;
    failed?: number;
    staleDropped?: number;
    tokenErrors?: number;
    lastError?: string;
    lastFailureAt?: Date;
  }
) {
  const sent = input.sent ?? 0;
  const failed = input.failed ?? 0;
  const staleDropped = input.staleDropped ?? 0;
  const tokenErrors = input.tokenErrors ?? 0;
  if (!sent && !failed && !staleDropped && !tokenErrors && !input.lastError) {
    return;
  }

  const day = startOfUtcDay(input.lastFailureAt ?? new Date());
  const lastError = input.lastError?.slice(0, 1000);
  await prisma.metaCapiDailyStat.upsert({
    where: { workspaceId_provider_day: { workspaceId, provider, day } },
    update: {
      sent: { increment: sent },
      failed: { increment: failed },
      staleDropped: { increment: staleDropped },
      tokenErrors: { increment: tokenErrors },
      ...(lastError ? { lastError } : {}),
      ...(input.lastFailureAt ? { lastFailureAt: input.lastFailureAt } : {}),
    },
    create: {
      workspaceId,
      provider,
      day,
      sent,
      failed,
      staleDropped,
      tokenErrors,
      lastError: lastError ?? null,
      lastFailureAt: input.lastFailureAt ?? null,
    },
  });
}

/**
 * Asks the job runner to flush soon. Coalesced in-process: a burst of events
 * produces one poke per interval, not one database write per event.
 */
async function enqueueAdEventFlushJob(tx: Tx = prisma) {
  const canCoalesce = tx === prisma;
  const now = Date.now();
  if (canCoalesce) {
    if (now < nextFlushPokeAt) return;
    if (flushPokePromise) return flushPokePromise;
  }

  const poke = enqueueJob(
    { kind: "META_CAPI_FLUSH", dedupeKey: "meta-capi-flush", maxAttempts: 5 },
    tx
  )
    .then(() => {
      if (canCoalesce) nextFlushPokeAt = Date.now() + FLUSH_POKE_INTERVAL_MS;
    })
    .finally(() => {
      if (canCoalesce) flushPokePromise = null;
    });

  if (canCoalesce) flushPokePromise = poke;
  await poke;
}

export function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code === "P2002"
    : Boolean(
        error &&
          typeof error === "object" &&
          "code" in error &&
          (error as { code?: unknown }).code === "P2002"
      );
}

function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}
