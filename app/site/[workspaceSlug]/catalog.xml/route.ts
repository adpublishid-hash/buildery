import { NextResponse } from "next/server";

import { buildCatalogFeed, renderCatalogFeedXml } from "@/lib/catalog-feed";
import { rateLimitByIp } from "@/lib/rate-limit";
import { getStoreWorkspace } from "@/lib/store";

/**
 * Public product catalog feed (Google Merchant RSS), fetched on a schedule by
 * Meta Commerce Manager, TikTok Catalog and Google Merchant Center. It holds
 * only what the storefront already shows publicly.
 *
 * Served at https://<store>.landing.my.id/catalog.xml via the subdomain rewrite.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  const limit = await rateLimitByIp("catalog-feed", 30, 60 * 1000);
  if (!limit.ok) return new NextResponse(null, { status: 429 });

  const workspace = await getStoreWorkspace(params.workspaceSlug);
  if (!workspace) return new NextResponse("Not found", { status: 404 });

  const feed = await buildCatalogFeed(workspace);
  return new NextResponse(renderCatalogFeedXml(workspace, feed), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      // Platforms poll hourly at most; a short shared cache absorbs retries.
      "cache-control": "public, max-age=900",
      "x-catalog-items": String(feed.items.length),
    },
  });
}
