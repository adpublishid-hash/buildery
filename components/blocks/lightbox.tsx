"use client";

import type React from "react";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { BlockImage } from "@/components/blocks/block-image";

/**
 * Click-to-zoom wrapper. Renders its children as a clickable trigger that
 * opens a fullscreen overlay showing the full image. Closes on backdrop
 * click, the close button, or Escape.
 */
export function Lightbox({
  src,
  alt,
  className,
  children,
}: {
  src: string;
  alt?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        aria-label={alt ? `Perbesar: ${alt}` : "Perbesar gambar"}
        className={cn("block w-full cursor-zoom-in", className)}
      >
        {children}
      </div>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={close}
          className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={close}
            aria-label="Tutup"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl leading-none text-white transition hover:bg-white/20"
          >
            ×
          </button>
          <BlockImage
            sizes={"92vw"}
            src={src}
            alt={alt || ""}
            className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      ) : null}
    </>
  );
}
