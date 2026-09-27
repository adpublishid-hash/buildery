import { NextResponse } from "next/server";

import { buildStoreSitemap, renderSitemapXml } from "@/lib/store-sitemap";
import { rateLimitByIp } from "@/lib/rate-limit";
import { getStoreWorkspace } from "@/lib/store";

/**
 * Per-store sitemap, served at https://<store>.landing.my.id/sitemap.xml via
 * the subdomain rewrite. Without it, a product page was only ever found by a
 * crawler if something already linked to it.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { workspaceSlug: string } }
) {
  const limit = await rateLimitByIp("store-sitemap", 60, 60 * 1000);
  if (!limit.ok) return new NextResponse(null, { status: 429 });

  const workspace = await getStoreWorkspace(params.workspaceSlug);
  if (!workspace) return new NextResponse("Not found", { status: 404 });

  const entries = await buildStoreSitemap(workspace);
  return new NextResponse(renderSitemapXml(entries), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      // Crawlers refetch often; an hour of shared cache absorbs that.
      "cache-control": "public, max-age=3600",
      "x-sitemap-urls": String(entries.length),
    },
  });
}
