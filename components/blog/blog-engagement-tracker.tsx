"use client";

import { useEffect } from "react";

const sent = new Set<string>();

export function sendBlogEvent(input: {
  workspaceId: string;
  postId: string;
  type: "VIEW" | "READ_COMPLETE" | "SHARE";
  platform?: string;
}) {
  const key = `${input.postId}:${input.type}:${input.platform ?? "-"}`;
  if (sent.has(key)) return;
  sent.add(key);
  fetch("/api/blog/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...input,
      path: window.location.pathname,
      referrer: document.referrer || null,
    }),
    keepalive: true,
  }).catch(() => sent.delete(key));
}

export function BlogEngagementTracker({
  workspaceId,
  postId,
}: {
  workspaceId: string;
  postId: string;
}) {
  useEffect(() => {
    sendBlogEvent({ workspaceId, postId, type: "VIEW" });

    let completed = false;
    const onScroll = () => {
      if (completed) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 0 && window.scrollY / max >= 0.85) {
        completed = true;
        sendBlogEvent({ workspaceId, postId, type: "READ_COMPLETE" });
        window.removeEventListener("scroll", onScroll);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [postId, workspaceId]);

  return null;
}
