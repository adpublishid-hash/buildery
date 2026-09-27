"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the open inbox current without a manual refresh.
 *
 * Inbound messages arrive through a webhook, which no client knows about, so
 * the page used to sit on stale data until someone reloaded it. This polls a
 * tiny endpoint and only re-renders the route when the answer actually changes
 * — and stops entirely while the tab is in the background.
 */
export function InboxPoller({ intervalMs = 15_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const lastSeen = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/inbox/state", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          latestMessageId: string | null;
          unread: number;
        };
        const fingerprint = `${data.latestMessageId ?? ""}:${data.unread}`;
        if (cancelled) return;
        // The first answer only establishes the baseline.
        if (lastSeen.current !== null && lastSeen.current !== fingerprint) {
          router.refresh();
        }
        lastSeen.current = fingerprint;
      } catch {
        // Offline or a dropped request: try again on the next tick.
      }
    }

    void check();
    const timer = window.setInterval(check, intervalMs);
    // Coming back to the tab should not wait out the remaining interval.
    document.addEventListener("visibilitychange", check);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [intervalMs, router]);

  return null;
}
