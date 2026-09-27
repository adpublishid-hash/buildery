import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { recordFormView } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";
import { rateLimitByIp } from "@/lib/rate-limit";

/**
 * Public beacon for form funnel analytics.
 *
 * Separate from /api/track because a form view is not a page view: it must
 * not fire a Meta PageView, and its workspace is derived from the form
 * rather than taken from the request, so the endpoint cannot be used to
 * write events against an arbitrary workspace.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { formId: string } }
) {
  const limit = await rateLimitByIp("form-view", 120, 60 * 1000);
  if (!limit.ok) return NextResponse.json({ ok: false }, { status: 429 });

  const body = (await req.json().catch(() => null)) as {
    step?: unknown;
  } | null;
  const rawStep = Number(body?.step ?? 0);
  if (!Number.isFinite(rawStep) || rawStep < 0 || rawStep > 50) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const form = await prisma.form.findUnique({
    where: { id: params.formId },
    select: { id: true, workspaceId: true, publishedVersion: true },
  });
  if (!form?.publishedVersion) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  await recordFormView({
    workspaceId: form.workspaceId,
    formId: form.id,
    step: Math.floor(rawStep),
    referrer: req.headers.get("referer"),
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}
