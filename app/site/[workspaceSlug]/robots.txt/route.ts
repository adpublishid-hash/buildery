import { NextResponse } from "next/server";

import { renderStoreRobotsTxt } from "@/lib/store-sitemap";
import { getStoreWorkspace } from "@/lib/store";

/** Keeps cart, checkout and member pages out of the index, and points at the sitemap. */
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  const workspace = await getStoreWorkspace(params.workspaceSlug);
  if (!workspace) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(renderStoreRobotsTxt(workspace.slug), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
