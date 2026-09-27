import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { inboxPulse } from "@/lib/inbox";
import { getCurrentWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * What the open inbox polls.
 *
 * Two small reads, so the page can decide whether anything changed before
 * asking Next to re-render the whole route.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const current = await getCurrentWorkspace(session.user.id);
  if (!current) {
    return NextResponse.json({ ok: false, error: "No workspace" }, { status: 404 });
  }

  const pulse = await inboxPulse(current.workspace.id);
  return NextResponse.json(
    { ok: true, ...pulse },
    { headers: { "Cache-Control": "no-store" } }
  );
}
