"use client";

import { useState } from "react";
import { Check, Link2, Linkedin, Twitter } from "lucide-react";

import { cn } from "@/lib/utils";
import { sendBlogEvent } from "@/components/blog/blog-engagement-tracker";

export function ShareBar({
  title,
  workspaceId,
  postId,
}: {
  title: string;
  workspaceId: string;
  postId: string;
}) {
  const [copied, setCopied] = useState(false);

  const currentUrl = () =>
    typeof window !== "undefined" ? window.location.href : "";

  async function copyLink() {
    const url = currentUrl();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopied(true);
    sendBlogEvent({ workspaceId, postId, type: "SHARE", platform: "copy" });
    window.setTimeout(() => setCopied(false), 2000);
  }

  function openShare(network: "x" | "linkedin") {
    const url = encodeURIComponent(currentUrl());
    const text = encodeURIComponent(title);
    const target =
      network === "x"
        ? `https://twitter.com/intent/tweet?url=${url}&text=${text}`
        : `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
    window.open(target, "_blank", "noopener,noreferrer");
    sendBlogEvent({ workspaceId, postId, type: "SHARE", platform: network });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={copyLink}
        aria-label="Copy link"
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition",
          copied
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
        )}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Link2 className="h-3.5 w-3.5" />
        )}
        {copied ? "Copied" : "Copy link"}
      </button>
      <button
        type="button"
        onClick={() => openShare("x")}
        aria-label="Share on X"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900"
      >
        <Twitter className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => openShare("linkedin")}
        aria-label="Share on LinkedIn"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900"
      >
        <Linkedin className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
