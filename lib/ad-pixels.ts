import { AD_PIXEL_LIMIT } from "@/lib/ad-pixel-constants";
import { prisma } from "@/lib/prisma";

/**
 * Extra Meta / TikTok pixels. The primary pixel still lives in
 * IntegrationSetting; these receive every event it does, in the browser and,
 * when they carry a token, through Meta CAPI / TikTok Events API.
 *
 * Not "server-only" on purpose: the queue modules that read it are imported by
 * the job runner and by tests, like lib/meta-capi.ts itself.
 */

export type AdPixelProvider = "META" | "TIKTOK";

export { AD_PIXEL_LIMIT };

export type ExtraServerPixel = {
  pixelId: string;
  accessToken: string;
  testEventCode: string | null;
};

const TTL_MS = 60_000;
const serverCache = new Map<string, { expiresAt: number; value: ExtraServerPixel[] }>();

function key(workspaceId: string, provider: AdPixelProvider) {
  return `${workspaceId}:${provider}`;
}

/** Extra pixels that get a server-side copy of each event. */
export async function getExtraServerPixels(
  workspaceId: string,
  provider: AdPixelProvider
): Promise<ExtraServerPixel[]> {
  const now = Date.now();
  const cached = serverCache.get(key(workspaceId, provider));
  if (cached && cached.expiresAt > now) return cached.value;

  const rows = await prisma.adPixel.findMany({
    where: { workspaceId, provider, isActive: true, serverEnabled: true, accessToken: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { pixelId: true, accessToken: true, testEventCode: true },
  });
  const value = rows
    .filter((row): row is ExtraServerPixel => Boolean(row.accessToken?.trim()))
    .slice(0, AD_PIXEL_LIMIT);
  serverCache.set(key(workspaceId, provider), { value, expiresAt: now + TTL_MS });
  return value;
}

/** Extra pixel ids the public site loads in the browser. */
export async function getExtraBrowserPixelIds(
  workspaceId: string,
  provider: AdPixelProvider
): Promise<string[]> {
  const rows = await prisma.adPixel.findMany({
    where: { workspaceId, provider, isActive: true },
    orderBy: { createdAt: "asc" },
    take: AD_PIXEL_LIMIT,
    select: { pixelId: true },
  });
  return rows.map((row) => row.pixelId);
}

export function clearExtraPixelCache(workspaceId?: string) {
  if (!workspaceId) {
    serverCache.clear();
    return;
  }
  serverCache.delete(key(workspaceId, "META"));
  serverCache.delete(key(workspaceId, "TIKTOK"));
}

/**
 * Where each event goes: "" for the primary pixel when its server copy is on,
 * then every extra pixel with a token. A pixel listed twice (the primary id
 * added again as an extra) is sent once.
 */
export function eventTargets(primaryPixelId: string | null, extras: ExtraServerPixel[]) {
  const targets: string[] = primaryPixelId ? [""] : [];
  const seen = new Set(primaryPixelId ? [primaryPixelId] : []);
  for (const extra of extras) {
    if (seen.has(extra.pixelId)) continue;
    seen.add(extra.pixelId);
    targets.push(extra.pixelId);
  }
  return targets;
}
