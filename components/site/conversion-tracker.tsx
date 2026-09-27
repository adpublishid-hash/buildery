"use client";

import { useEffect } from "react";

/**
 * Reports one funnel step from the browser.
 *
 * A client effect rather than a server render, so Next's link prefetching
 * cannot inflate the count — a prefetch fetches the page but never runs
 * effects.
 */

// Module-scoped, so React's double-mount in development records once.
const sent = new Set<string>();

export function ConversionTracker({
  workspaceId,
  type,
  productId,
  value,
}: {
  workspaceId: string;
  type: "VIEW_CONTENT";
  productId?: string;
  value?: number;
}) {
  useEffect(() => {
    const key = `${workspaceId}:${type}:${productId ?? "-"}`;
    if (sent.has(key)) return;
    sent.add(key);

    fetch("/api/track/conversion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        type,
        productId,
        value,
        path: window.location.pathname,
      }),
      keepalive: true,
    }).catch(() => {
      // Non-fatal: drop the key so a later navigation can retry.
      sent.delete(key);
    });
  }, [workspaceId, type, productId, value]);

  return null;
}
