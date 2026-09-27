import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { normalizeDomain } from "@/lib/domain";

/**
 * Internal endpoint used by middleware (edge runtime) to resolve a custom
 * domain to a workspace slug. Result cached per-instance for 30s.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 30_000;
type Entry = { slug: string | null; expires: number };
const cache = new Map<string, Entry>();

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const host = normalizeDomain(url.searchParams.get("host") ?? "");
  const requestedSlug = url.searchParams.get("slug")?.trim().toLowerCase() ?? "";
  if (requestedSlug) {
    const workspace = await prisma.workspace.findFirst({
      where: {
        status: "ACTIVE",
        OR: [{ slug: requestedSlug }, { slugHistory: { some: { slug: requestedSlug } } }],
      },
      select: { slug: true },
    });
    return NextResponse.json({ slug: workspace?.slug ?? null });
  }
  if (!host) return NextResponse.json({ slug: null });

  const now = Date.now();
  const hit = cache.get(host);
  if (hit && hit.expires > now) {
    return NextResponse.json({ slug: hit.slug });
  }

  const verified = await prisma.workspace.findFirst({
    where: { customDomain: host, status: "ACTIVE", customDomainStatus: "ACTIVE" },
    select: { slug: true },
  });
  const slug = verified?.slug ?? null;
  cache.set(host, { slug, expires: now + CACHE_TTL_MS });
  return NextResponse.json({ slug });
}
