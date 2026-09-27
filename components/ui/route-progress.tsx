"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A thin progress bar pinned to the top of the viewport. It starts when an
 * internal link is clicked and completes once the new route has rendered.
 *
 * App Router doesn't expose a navigation-start event in Next 14, so we
 * detect it by capturing same-origin anchor clicks.
 *
 * Deliberately built on a CSS transition rather than an animation library.
 * This lives in the root layout, so importing one here put ~119 kB of
 * JavaScript on every page in the app — including published landing pages,
 * which are the pages that can least afford it — to animate two pixels.
 */
export function RouteProgress() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle");
  const [width, setWidth] = useState(0);
  const doneTimer = useRef<number | null>(null);

  // Navigation finished — the rendered route changed.
  useEffect(() => {
    setPhase((current) => (current === "loading" ? "done" : current));
  }, [pathname, searchParams]);

  // Run out the completion, then reset so the next navigation starts at zero.
  useEffect(() => {
    if (phase !== "done") return;
    setWidth(100);
    doneTimer.current = window.setTimeout(() => {
      setPhase("idle");
      setWidth(0);
    }, 260);
    return () => {
      if (doneTimer.current) window.clearTimeout(doneTimer.current);
    };
  }, [phase]);

  // Navigation (likely) starting — a same-tab internal link was clicked.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (
        !href ||
        !href.startsWith("/") ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      ) {
        return;
      }
      const current = window.location.pathname + window.location.search;
      if (href === current) return;

      setPhase("loading");
      setWidth(0);
      // Next frame, so the transition has a start value to move away from.
      requestAnimationFrame(() => requestAnimationFrame(() => setWidth(92)));
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (phase === "idle") return null;

  return (
    <div
      role="progressbar"
      aria-hidden="true"
      className="fixed left-0 top-0 z-[120] h-[2px] bg-zinc-900 dark:bg-zinc-100"
      style={{
        width: `${width}%`,
        opacity: phase === "done" ? 0 : 1,
        transition:
          phase === "done"
            ? "width 200ms ease-out, opacity 250ms ease-out"
            : "width 6s ease-out",
      }}
    />
  );
}
