import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { recordConversionEvent } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";
import { rateLimitByIp } from "@/lib/rate-limit";

/**
 * Records a funnel step the browser is best placed to notice — currently the
 * product view. The steps that follow a user action (add to cart, checkout,
 * purchase) are recorded server-side instead, where an ad blocker cannot
 * silently drop them.
 */
export const dynamic = "force-dynamic";

/** Only the browser-observed step; the rest never come from here. */
const ALLOWED = new Set(["VIEW_CONTENT"]);

export async function POST(req: NextRequest) {
  const limit = await rateLimitByIp("track-conversion", 60, 60 * 1000);
  if (!limit.ok) return NextResponse.json({ ok: false }, { status: 429 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { workspaceId, type, productId, value, path } =
    (body as Record<string, unknown>) ?? {};

  if (
    typeof workspaceId !== "string" ||
    !workspaceId ||
    typeof type !== "string" ||
    !ALLOWED.has(type)
  ) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // The product must belong to the workspace, or this endpoint could be used
  // to write events against arbitrary ids.
  let product: { id: string; workspaceId: string } | null = null;
  if (typeof productId === "string" && productId) {
    product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, workspaceId: true },
    });
    if (!product || product.workspaceId !== workspaceId) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
  } else {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });
    if (!workspace) return NextResponse.json({ ok: false }, { status: 400 });
  }

  const amount =
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? Math.floor(value)
      : null;

  await recordConversionEvent({
    workspaceId,
    type: "VIEW_CONTENT",
    productId: product?.id ?? null,
    value: amount,
    path: typeof path === "string" ? path : null,
  });

  // No ad-platform event from here. The product page's MetaEventTracker
  // already sends ViewContent to the pixels and, deduplicated by event id and
  // throttled per visitor, to the server APIs. A second server copy with its
  // own id was counted by Meta as a separate view.

  return NextResponse.json({ ok: true });
}
