import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";

/**
 * Strips obviously dangerous fragments from a user-provided inline script
 * snippet. The owner is still responsible for what they paste — this just
 * stops the most common accidents.
 */
export function sanitizeCustomScript(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > 2000) return null;
  // Prevent breaking out of the surrounding <script> tag.
  if (/<\/script/i.test(trimmed)) return null;
  // Don't allow HTML comments smuggling things in.
  if (/<!--/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Loads the integration settings for a workspace. Cached per request so
 * the public site layout + page render share one DB hit.
 */
export const getIntegrationByWorkspaceSlug = cache(
  async (workspaceSlug: string) => {
    const workspace = await prisma.workspace.findFirst({
      where: { slug: workspaceSlug, status: "ACTIVE" },
      select: {
        id: true,
        integration: {
          select: {
            metaPixelId: true,
            metaCapiEnabled: true,
            tiktokPixelId: true,
            adConsentRequired: true,
            googleAdsConversionId: true,
            googleAdsPurchaseLabel: true,
            googleAnalyticsId: true,
            googleTagManagerId: true,
            googleSearchConsoleVerification: true,
            customHeadScript: true,
          },
        },
        // Extra pixels load next to the primary one. Tokens stay out: this
        // feeds the public layout, which only needs ids.
        adPixels: {
          where: { isActive: true },
          orderBy: { createdAt: "asc" },
          take: 10,
          select: { provider: true, pixelId: true, serverEnabled: true },
        },
      },
    });
    if (!workspace?.integration) return null;
    return { ...workspace.integration, extraPixels: workspace.adPixels };
  }
);
