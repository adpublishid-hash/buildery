"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui/button";

/** Copies a (possibly root-relative) URL as an absolute link. */
export function CopyLinkButton({
  href,
  label = "Copy link",
  toastMessage = "Link copied",
  variant = "outline",
  size,
}: {
  href: string;
  label?: string;
  toastMessage?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    const url = href.startsWith("/") ? `${window.location.origin}${href}` : href;
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(true);
        toast.success(toastMessage);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => toast.error("Could not copy"));
  }

  return (
    <Button type="button" variant={variant} size={size} onClick={copy}>
      {copied ? <Check /> : <Link2 />}
      {label}
    </Button>
  );
}
