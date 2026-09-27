import Link from "next/link";

import type { MarqueeData, MarqueeItem } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";

const SPEED_DURATION: Record<MarqueeData["speed"], string> = {
  slow: "60s",
  normal: "35s",
  fast: "18s",
};

const SIZE_CLASS: Record<MarqueeData["size"], string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl md:text-2xl",
};

const SIZE_PADDING: Record<MarqueeData["size"], string> = {
  sm: "py-2",
  md: "py-3",
  lg: "py-5",
};

export function MarqueeBlock({ data }: { data: MarqueeData }) {
  const tone = data.tone ?? "light";
  const direction = data.direction ?? "left";
  const speed = data.speed ?? "normal";
  const size = data.size ?? "md";
  const separator = data.separator ?? "dot";
  const pauseOnHover = data.pauseOnHover ?? true;
  const centered = (data.align ?? "center") === "center";
  const inverse = tone === "dark" || tone === "accent";
  const items = data.items ?? [];

  const surfaceTone =
    tone === "dark"
      ? "bg-zinc-950 text-white"
      : tone === "accent"
        ? "bg-[var(--bd-accent,#18181b)] text-white"
        : tone === "soft"
          ? "bg-zinc-50 text-zinc-900"
          : "bg-white text-zinc-900 border-y border-zinc-200";

  // Duplicate items so the translateX -50% animation loops seamlessly.
  const looped = items.length > 0 ? [...items, ...items] : items;

  return (
    <section className="px-0 py-8">
      {data.eyebrow || data.heading || data.subheading ? (
        <div
          className={cn(
            "mx-auto mb-6 max-w-3xl px-6",
            centered && "text-center"
          )}
        >
          {data.eyebrow ? (
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
              {data.eyebrow}
            </p>
          ) : null}
          {data.heading ? (
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
              {data.heading}
            </h2>
          ) : null}
          {data.subheading ? (
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              {data.subheading}
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "group overflow-hidden",
          SIZE_PADDING[size],
          surfaceTone,
          pauseOnHover && "bd-marquee-pause"
        )}
      >
        {looped.length === 0 ? (
          <div className="px-6 text-center text-sm text-zinc-400">
            Tambahkan item untuk menampilkan marquee.
          </div>
        ) : (
          <div
            className={cn(
              "bd-marquee-track flex w-max items-center gap-10 pl-10",
              direction === "right" && "bd-marquee-track-right",
              SIZE_CLASS[size]
            )}
            style={{ ["--bd-marquee-duration" as string]: SPEED_DURATION[speed] }}
          >
            {looped.map((item, index) => (
              <MarqueeNode
                key={`${item.text}-${index}`}
                item={item}
                separator={separator}
                inverse={inverse}
                isLast={index === looped.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function MarqueeNode({
  item,
  separator,
  inverse,
  isLast,
}: {
  item: MarqueeItem;
  separator: MarqueeData["separator"];
  inverse: boolean;
  isLast: boolean;
}) {
  const content = (
    <span className="inline-flex items-center gap-2 whitespace-nowrap font-medium">
      {item.icon ? <span aria-hidden>{item.icon}</span> : null}
      <span>{item.text}</span>
    </span>
  );
  return (
    <>
      {item.href ? (
        <Link
          href={item.href}
          className="transition hover:opacity-80"
        >
          {content}
        </Link>
      ) : (
        content
      )}
      {!isLast && separator !== "none" ? (
        <span
          aria-hidden
          className={cn(
            "select-none",
            inverse ? "text-white/40" : "text-zinc-400"
          )}
        >
          {separator === "dot" ? "•" : "—"}
        </span>
      ) : null}
    </>
  );
}
