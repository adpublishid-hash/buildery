import { NextResponse } from "next/server";

import { reportError } from "@/lib/error-reporting";
import { rateLimitByIp } from "@/lib/rate-limit";

/**
 * Receives reports from the client error boundaries. In production Next.js
 * hides the real message from the browser and hands over only a digest, which
 * is what makes the report useful: the same digest appears next to the full
 * stack in the server log.
 *
 * Unauthenticated by necessity (a crashed storefront page has no session), so
 * it is rate-limited, size-capped, and stores only short strings.
 */

const MAX_BODY_BYTES = 8_000;
const BOUNDARIES = new Set(["root", "global", "dashboard"]);

export async function POST(req: Request) {
  const limit = await rateLimitByIp("client-error-report", 20, 60 * 1000);
  if (!limit.ok) return new NextResponse(null, { status: 429 });

  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return new NextResponse(null, { status: 403 });
    } catch {
      return new NextResponse(null, { status: 400 });
    }
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const text = (value: unknown, max: number) =>
    typeof value === "string" ? value.slice(0, max) : "";

  const boundary = BOUNDARIES.has(text(body.boundary, 20)) ? text(body.boundary, 20) : "root";
  const message = text(body.message, 500) || "(no message)";
  const digest = text(body.digest, 100);
  const path = text(body.path, 300);

  reportError(`client:${boundary}`, message, {
    fingerprintExtra: digest,
    context: { digest: digest || undefined, path: path || undefined },
  });

  return new NextResponse(null, { status: 204 });
}
