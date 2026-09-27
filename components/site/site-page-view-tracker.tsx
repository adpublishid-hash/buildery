"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { trackAdPageView } from "@/lib/meta-client";
import { readCurrentPageId } from "@/components/site/page-id-beacon";

/**
 * The one page-view tracker for every public page.
 *
 * It records the store's own analytics (always — that is the store's data
 * about its own visitors) and, when cookies allow it, sends the page view to
 * GA4 and the ad pixels with a shared event id.
 *
 * It used to live on builder pages only, so product, cart, checkout and course
 * pages — the ones that earn money — never appeared in the traffic reports.
 *
 * A client effect, not a server render: Next prefetches pages on hover, and a
 * prefetch must not count as a visit.
 */

// The URL that last counted. Comparing with the previous URL, rather than
// keeping every URL seen, means returning to a page counts again — as a visit
// does — while React StrictMode's double mount still counts once.
let lastTracked: string | null = null;
let lastPageLocation: string | null = null;

export function resetPageViewTracking() {
  lastTracked = null;
}

export function SitePageViewTracker({
  workspaceId,
  trackingAllowed,
  sendServerAdEvents,
}: {
  workspaceId: string;
  /** False while the store requires cookie consent and it has not been given. */
  trackingAllowed: boolean;
  /** Whether a server-side twin of the ad PageView is worth sending. */
  sendServerAdEvents: boolean;
}) {
  const pathname = usePathname() ?? "";
  const search = useSearchParams()?.toString() ?? "";
  const path = search ? `${pathname}?${search}` : pathname;

  useEffect(() => {
    const key = `${workspaceId}:${path}`;
    if (lastTracked === key) return;
    lastTracked = key;

    const pageReferrer = lastPageLocation || document.referrer || null;
    lastPageLocation = window.location.href;

    fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        // Only builder pages have a Page row; storefront pages send null.
        pageId: readCurrentPageId(),
        path,
        referrer: pageReferrer,
      }),
      keepalive: true,
    }).catch(() => {
      // Non-fatal: allow the next navigation to try again.
      lastTracked = null;
    });

    if (trackingAllowed) {
      trackAdPageView({
        workspaceId,
        sendServer: sendServerAdEvents,
        pageReferrer,
      });
    }
  }, [workspaceId, path, trackingAllowed, sendServerAdEvents]);

  return null;
}
