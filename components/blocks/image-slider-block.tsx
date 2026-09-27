"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { ImageSliderData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";
import { BlockImage } from "@/components/blocks/block-image";

const ASPECTS: Record<ImageSliderData["aspectRatio"], string> = {
  wide: "aspect-[16/7]",
  video: "aspect-video",
  cinema: "aspect-[21/9]",
  square: "aspect-square",
  portrait: "aspect-[4/5]",
  auto: "",
};

function frameClass(frame: ImageSliderData["frame"]) {
  if (frame === "none") return "rounded-none";
  if (frame === "shadow") return "rounded-2xl shadow-xl shadow-zinc-200/70";
  return "rounded-2xl";
}

export function ImageSliderBlock({ data }: { data: ImageSliderData }) {
  const items = data.items.filter((i) => i.url);
  const align = data.align ?? "center";
  const count = items.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);

  const go = useCallback(
    (next: number) => {
      if (count === 0) return;
      if (data.loop) {
        setIndex(((next % count) + count) % count);
      } else {
        setIndex(Math.max(0, Math.min(count - 1, next)));
      }
    },
    [count, data.loop]
  );

  // Autoplay.
  useEffect(() => {
    if (!data.autoplay || paused || count <= 1) return;
    const id = setInterval(
      () => setIndex((i) => (data.loop ? (i + 1) % count : Math.min(i + 1, count - 1))),
      Math.max(2, data.intervalSec) * 1000
    );
    return () => clearInterval(id);
  }, [data.autoplay, data.intervalSec, data.loop, paused, count]);

  // Keep index valid when items change in the editor.
  useEffect(() => {
    if (index > count - 1) setIndex(Math.max(0, count - 1));
  }, [count, index]);

  return (
    <section className="px-6 py-16 md:px-10">
      <div className="mx-auto max-w-6xl">
        {data.eyebrow || data.heading || data.subheading ? (
          <div
            className={cn(
              "mb-8 max-w-2xl",
              align === "center" && "mx-auto text-center",
              align === "left" && "mr-auto text-left"
            )}
          >
            {data.eyebrow ? (
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                {data.eyebrow}
              </p>
            ) : null}
            {data.heading ? (
              <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 md:text-4xl">
                {data.heading}
              </h2>
            ) : null}
            {data.subheading ? (
              <p className="mt-3 text-base leading-relaxed text-zinc-500">
                {data.subheading}
              </p>
            ) : null}
          </div>
        ) : null}

        {count === 0 ? (
          <div className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-zinc-300 text-sm text-zinc-400">
            Tambahkan gambar ke slider
          </div>
        ) : (
          <div
            className={cn("group relative overflow-hidden bg-zinc-100", frameClass(data.frame))}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
            onTouchEnd={(e) => {
              if (touchX.current == null) return;
              const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
              if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
              touchX.current = null;
            }}
          >
            <div
              className="flex transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${index * 100}%)` }}
            >
              {items.map((item, i) => {
                const img = (
                  <BlockImage
                    sizes={"100vw"}
                    src={item.url}
                    alt={item.alt}
                    className={cn(
                      "w-full bg-zinc-100",
                      ASPECTS[data.aspectRatio],
                      data.aspectRatio === "auto" ? "h-auto" : "h-full",
                      data.fit === "contain" ? "object-contain" : "object-cover"
                    )}
                  />
                );
                return (
                  <div key={`${item.url}-${i}`} className="relative w-full shrink-0">
                    {item.href ? (
                      <a href={item.href} className="block">
                        {img}
                      </a>
                    ) : (
                      img
                    )}
                    {data.showCaption && item.caption ? (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950/80 via-zinc-950/30 to-transparent px-5 pb-5 pt-16">
                        <p className="text-sm font-medium text-white">{item.caption}</p>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {data.showArrows && count > 1 ? (
              <>
                <button
                  type="button"
                  aria-label="Sebelumnya"
                  onClick={() => go(index - 1)}
                  className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-zinc-800 shadow-sm transition hover:bg-white"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label="Berikutnya"
                  onClick={() => go(index + 1)}
                  className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-zinc-800 shadow-sm transition hover:bg-white"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            ) : null}

            {data.showDots && count > 1 ? (
              <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5">
                {items.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Slide ${i + 1}`}
                    onClick={() => setIndex(i)}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      i === index ? "w-5 bg-white" : "w-1.5 bg-white/60 hover:bg-white/80"
                    )}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
