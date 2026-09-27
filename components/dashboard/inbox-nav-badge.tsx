"use client";

import { useEffect, useState } from "react";

/**
 * The unread count beside the Inbox menu entry.
 *
 * It cannot be a plain server-rendered number: messages arrive by webhook, and
 * the operator may be sitting on any other dashboard page when one does. The
 * layout's own render is only the starting value; this keeps it honest by
 * polling the same endpoint the open inbox uses, and stops while the tab is in
 * the background.
 */
/** Fired by the inbox when it changes something the badge counts. */
export const INBOX_CHANGED = "inbox:changed";

export function announceInboxChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(INBOX_CHANGED));
  }
}

export function InboxNavBadge({
  initial,
  intervalMs = 30_000,
}: {
  initial: number;
  intervalMs?: number;
}) {
  const [count, setCount] = useState(initial);

  // A navigation re-renders the layout with a fresh number; take it.
  useEffect(() => setCount(initial), [initial]);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/inbox/state", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { unread?: number };
        if (!cancelled && typeof data.unread === "number") setCount(data.unread);
      } catch {
        // Offline or a dropped request: keep the last known count.
      }
    }

    void check();
    const timer = window.setInterval(check, intervalMs);
    document.addEventListener("visibilitychange", check);
    // The inbox itself announces a change (a thread read, a reply sent) so the
    // badge does not sit wrong until the next tick.
    window.addEventListener(INBOX_CHANGED, check);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener(INBOX_CHANGED, check);
    };
  }, [intervalMs]);

  if (count <= 0) return null;
  return <CountPill count={count} />;
}

/** The dark gradient count beside a sidebar entry. */
export function CountPill({ count }: { count: number }) {
  return (
    <span className="kv-gradient kv-tabular ml-auto inline-flex h-[20px] min-w-[20px] shrink-0 items-center justify-center rounded-full px-[6px] text-[11px] font-medium leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}
