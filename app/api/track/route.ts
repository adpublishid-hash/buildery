import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { recordPageView } from "@/lib/analytics";
import { ATTRIBUTION_COOKIE, VISITOR_COOKIE } from "@/lib/analytics-visitor";
import { rateLimitByIp } from "@/lib/rate-limit";

/**
 * First-party page view, called by SitePageViewTracker on every public page.
 * This is the store's own analytics, so it is recorded regardless of the ad
 * cookie banner; the ad platforms' copies are gated separately.
 */
export async function POST(req: NextRequest) {
  // 120 page-view pings per minute per IP — generous, but caps abuse.
  const limit = await rateLimitByIp("track", 120, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { workspaceId, pageId, path, referrer } =
    (body as Record<string, unknown>) ?? {};

  if (typeof workspaceId !== "string" || !workspaceId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Validate the page (if given) actually belongs to the workspace, so the
  // endpoint can't be used to inject events against arbitrary ids.
  if (pageId !== undefined && pageId !== null) {
    if (typeof pageId !== "string") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      select: { website: { select: { workspaceId: true } } },
    });
    if (!page || page.website.workspaceId !== workspaceId) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
  } else {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });
    if (!workspace) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
  }

  await recordPageView({
    workspaceId,
    pageId: typeof pageId === "string" ? pageId : null,
    path: typeof path === "string" ? path : null,
    referrer: typeof referrer === "string" ? referrer : null,
    userAgent: req.headers.get("user-agent"),
    visitorId: req.cookies.get(VISITOR_COOKIE)?.value ?? null,
    attributionCookie: req.cookies.get(ATTRIBUTION_COOKIE)?.value ?? null,
  });

  return NextResponse.json({ ok: true });
}
