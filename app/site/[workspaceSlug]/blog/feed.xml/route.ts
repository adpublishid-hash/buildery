import { NextResponse } from "next/server";

import { renderBlogFeed } from "@/lib/blog-feed";
import { getStoreWorkspace } from "@/lib/store";

export const revalidate = 300;

export async function GET(
  _request: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  const workspace = await getStoreWorkspace(params.workspaceSlug);
  if (!workspace) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(await renderBlogFeed(workspace), {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
