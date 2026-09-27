import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";

import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/error-reporting";

/**
 * In-memory fixed-window rate limiter.
 *
 * Adequate for a single-instance VPS deploy (PM2 fork mode = one process).
 * For a multi-instance / load-balanced setup, swap the Map for a shared
 * store such as Redis.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number) {
  // Drop expired buckets occasionally so the Map can't grow unbounded.
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  /** Seconds until the window resets (when blocked). */
  retryAfter: number;
  remaining: number;
};

/**
 * Records one hit against `key` and reports whether it's within `limit`
 * over `windowMs`.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0, remaining: limit - 1 };
  }

  if (bucket.count >= limit) {
    return {
      ok: false,
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
      remaining: 0,
    };
  }

  bucket.count += 1;
  return { ok: true, retryAfter: 0, remaining: limit - bucket.count };
}

/** Best-effort client IP from proxy headers (falls back to "unknown"). */
export function clientIp(): string {
  const h = headers();
  if (process.env.TRUST_PROXY === "true") {
    return h.get("x-real-ip")?.trim() || "unknown";
  }
  return "unknown";
}

/** Shared fixed-window limiter backed by PostgreSQL for multi-worker deploys. */
export async function rateLimitShared(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  const keyHash = createHash("sha256").update(key).digest("hex");

  try {
    const rows = await prisma.$queryRaw<Array<{ count: number; resetAt: Date }>>`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
      VALUES (${keyHash}, 1, ${resetAt}, ${now})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimitBucket"."resetAt" <= ${now} THEN 1
          ELSE "RateLimitBucket"."count" + 1
        END,
        "resetAt" = CASE
          WHEN "RateLimitBucket"."resetAt" <= ${now} THEN ${resetAt}
          ELSE "RateLimitBucket"."resetAt"
        END,
        "updatedAt" = ${now}
      RETURNING "count", "resetAt"
    `;
    const bucket = rows[0];
    if (!bucket) throw new Error("Rate limit update returned no row.");
    const count = Number(bucket.count);
    return {
      ok: count <= limit,
      retryAfter:
        count <= limit
          ? 0
          : Math.max(
              1,
              Math.ceil((new Date(bucket.resetAt).getTime() - now.getTime()) / 1000)
            ),
      remaining: Math.max(0, limit - count),
    };
  } catch (error) {
    reportError("rate-limit shared store failed; using local fallback", error);
    return rateLimit(keyHash, limit, windowMs);
  }
}

/**
 * Convenience wrapper: rate-limits the current request's IP for a named
 * action. Returns the result so the caller can shape its own response.
 */
export async function rateLimitByIp(
  action: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  return rateLimitShared(`${action}:${clientIp()}`, limit, windowMs);
}
