import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { runDueJobs } from "@/lib/jobs/runner";
import { reportError } from "@/lib/error-reporting";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const secret = process.env.JOBS_RUNNER_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Job runner is not configured." },
      { status: 503 }
    );
  }

  if (!isAuthorized(req, secret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const summary = await runDueJobs();
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job run failed";
    reportError("jobs run failed", error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function isAuthorized(req: NextRequest, secret: string) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return timingSafeEqual(token, secret);
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
