import type { ImageData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";
import { Lightbox } from "./lightbox";
import { BlockImage } from "@/components/blocks/block-image";

const WIDTHS: Record<ImageData["width"], string> = {
  narrow: "max-w-xl",
  wide: "max-w-3xl",
  full: "max-w-5xl",
  bleed: "max-w-none",
};

const ASPECTS: Record<NonNullable<ImageData["aspectRatio"]>, string> = {
  auto: "",
  video: "aspect-video",
  square: "aspect-square",
  portrait: "aspect-[4/5]",
  wide: "aspect-[21/9]",
};

export function ImageBlock({ data }: { data: ImageData }) {
  const width = data.width ?? "wide";
  const frame = data.frame ?? (data.rounded ? "rounded" : "none");
  const captionPosition = data.captionPosition ?? "below";
  const align = data.align ?? "center";
  const image = data.url ? (
    <BlockImage
      sizes={"(min-width: 768px) 768px, 100vw"}
      src={data.url}
      alt={data.alt}
      className={cn(
        "w-full",
        ASPECTS[data.aspectRatio ?? "auto"],
        data.objectFit === "contain" ? "object-contain" : "object-cover",
        frame === "none" ? "rounded-none" : "rounded-[inherit]"
      )}
    />
  ) : (
    <div className="flex h-56 w-full items-center justify-center rounded-xl border border-dashed border-zinc-300 text-sm text-zinc-400">
      No image URL set
    </div>
  );
  const framedImage =
    frame === "browser" ? (
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl shadow-zinc-200/70">
        <div className="flex h-9 items-center gap-1.5 border-b border-zinc-100 bg-zinc-50 px-4">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </div>
        {image}
      </div>
    ) : (
      <div
        className={cn(
          "relative overflow-hidden",
          frame === "rounded" && "rounded-2xl",
          frame === "border" && "rounded-2xl border border-zinc-200 bg-white p-2",
          frame === "shadow" && "rounded-2xl bg-white shadow-xl shadow-zinc-200/70"
        )}
      >
        {image}
        {data.caption && captionPosition === "overlay" ? (
          <figcaption className="absolute inset-x-4 bottom-4 rounded-xl bg-zinc-950/75 px-4 py-3 text-sm text-white backdrop-blur">
            {data.caption}
          </figcaption>
        ) : null}
      </div>
    );

  return (
    <section className={cn("px-6 py-12 md:px-10", width === "bleed" && "px-0 md:px-0")}>
      <figure
        className={cn(
          "mx-auto",
          WIDTHS[width],
          align === "left" && "ml-0 mr-auto",
          align === "right" && "ml-auto mr-0"
        )}
      >
        {data.eyebrow || data.title || data.description ? (
          <div
            className={cn(
              "mb-6 max-w-2xl",
              align === "center" && "mx-auto text-center",
              align === "right" && "ml-auto text-right"
            )}
          >
            {data.eyebrow ? (
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                {data.eyebrow}
              </p>
            ) : null}
            {data.title ? (
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
                {data.title}
              </h2>
            ) : null}
            {data.description ? (
              <p className="mt-3 text-base leading-relaxed text-zinc-500">
                {data.description}
              </p>
            ) : null}
          </div>
        ) : null}

        {data.lightbox && data.url ? (
          <Lightbox src={data.url} alt={data.alt} className="transition hover:opacity-95">
            {framedImage}
          </Lightbox>
        ) : data.linkHref ? (
          <a href={data.linkHref} className="block transition hover:opacity-95">
            {framedImage}
          </a>
        ) : (
          framedImage
        )}

        {data.caption && captionPosition === "below" ? (
          <figcaption
            className={cn(
              "mt-3 text-sm text-zinc-500",
              align === "center" && "text-center",
              align === "right" && "text-right"
            )}
          >
            {data.caption}
          </figcaption>
        ) : null}
      </figure>
    </section>
  );
}
