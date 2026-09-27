import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Self-hosted error capture.
 *
 * Every failure used to end at `console.error`, which lands in the PM2 log and
 * is never read. `reportError` keeps that log line and also records the error in
 * `ErrorEvent`, where /admin/errors shows it. Identical failures share one row
 * (same fingerprint) and bump its count, so a loop that fails a thousand times
 * does not write a thousand rows.
 *
 * Reporting must never become a second failure: it never throws, never awaits
 * on the caller's path, and falls back to the log if the database is down.
 */

const MAX_MESSAGE = 1000;
const MAX_STACK = 8000;
const MAX_CONTEXT = 4000;
/** Repeats of one fingerprint inside this window are counted, not written. */
const WRITE_WINDOW_MS = 10_000;
const MAX_TRACKED_FINGERPRINTS = 500;

const SENSITIVE_KEY = /secret|token|password|passwd|authorization|cookie|api[-_]?key|server[-_]?key/i;

type Throttle = { lastWrite: number; pending: number };
const throttle = new Map<string, Throttle>();

export type ReportErrorOptions = {
  /** Extra detail to store with the event. Sensitive-looking keys are redacted. */
  context?: Record<string, unknown>;
  /**
   * Distinguishes errors that share a message, e.g. a Next.js digest for
   * client boundaries, whose message is always the same generic text.
   */
  fingerprintExtra?: string;
};

/**
 * Logs the error and records it for /admin/errors. Fire-and-forget: returns
 * immediately and never throws.
 */
export function reportError(
  source: string,
  error: unknown,
  options: ReportErrorOptions = {}
): void {
  console.error(`[${source}]`, error);

  if (process.env.NODE_ENV === "test" && process.env.ERROR_REPORTING_IN_TESTS !== "1") {
    return;
  }

  try {
    const { message, stack } = describeError(error);
    const fingerprint = errorFingerprint(source, message, options.fingerprintExtra);

    const now = Date.now();
    const entry = throttle.get(fingerprint);
    if (entry && now - entry.lastWrite < WRITE_WINDOW_MS) {
      entry.pending += 1;
      return;
    }
    const occurrences = 1 + (entry?.pending ?? 0);
    if (throttle.size >= MAX_TRACKED_FINGERPRINTS) throttle.clear();
    throttle.set(fingerprint, { lastWrite: now, pending: 0 });

    void persist({
      fingerprint,
      source: source.slice(0, 100),
      message,
      stack,
      context: sanitizeContext(options.context),
      occurrences,
    });
  } catch (reportingError) {
    console.error("[error-reporting] could not record error:", reportingError);
  }
}

async function persist(event: {
  fingerprint: string;
  source: string;
  message: string;
  stack: string | null;
  context: Prisma.InputJsonValue | undefined;
  occurrences: number;
}) {
  try {
    const now = new Date();
    await prisma.errorEvent.upsert({
      where: { fingerprint: event.fingerprint },
      create: {
        fingerprint: event.fingerprint,
        source: event.source,
        message: event.message,
        stack: event.stack,
        context: event.context,
        count: event.occurrences,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        message: event.message,
        ...(event.stack ? { stack: event.stack } : {}),
        ...(event.context !== undefined ? { context: event.context } : {}),
        count: { increment: event.occurrences },
        lastSeenAt: now,
        // A resolved error that happens again is not resolved.
        resolvedAt: null,
      },
    });
  } catch (persistError) {
    console.error("[error-reporting] could not record error:", persistError);
  }
}

export function describeError(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    const message = `${error.name}: ${error.message}`;
    return {
      message: message.slice(0, MAX_MESSAGE),
      stack: error.stack ? error.stack.slice(0, MAX_STACK) : null,
    };
  }
  if (typeof error === "string") {
    return { message: error.slice(0, MAX_MESSAGE) || "(empty error)", stack: null };
  }
  let message: string;
  try {
    message = JSON.stringify(error) ?? String(error);
  } catch {
    message = String(error);
  }
  return { message: message.slice(0, MAX_MESSAGE), stack: null };
}

/**
 * Groups errors that differ only by volatile values — ids, numbers, emails —
 * so "Order clx9… not found" is one issue, not one per order.
 */
export function normalizeErrorMessage(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "<email>")
    .replace(/\bc[a-z0-9]{20,32}\b/g, "<id>")
    .replace(/\b[0-9a-f]{16,}\b/gi, "<hex>")
    .replace(/\d+/g, "#")
    .trim();
}

export function errorFingerprint(source: string, message: string, extra?: string): string {
  return createHash("sha256")
    .update(`${source}\n${normalizeErrorMessage(message)}\n${extra ?? ""}`)
    .digest("hex");
}

export function sanitizeContext(
  context: Record<string, unknown> | undefined
): Prisma.InputJsonValue | undefined {
  if (!context) return undefined;
  let json: string;
  try {
    json = JSON.stringify(context, (key, value) =>
      key && SENSITIVE_KEY.test(key) ? "[redacted]" : value
    );
  } catch {
    return { unserializable: true };
  }
  if (json.length > MAX_CONTEXT) {
    return { truncated: json.slice(0, MAX_CONTEXT) };
  }
  return JSON.parse(json) as Prisma.InputJsonValue;
}

/** Test hook: forget throttle state between cases. */
export function resetErrorReportingForTests() {
  throttle.clear();
}
