import Link from "next/link";
import { Play } from "lucide-react";

import type { VideoData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";
import { BlockImage } from "@/components/blocks/block-image";

const WIDTHS: Record<VideoData["width"], string> = {
  narrow: "max-w-2xl",
  wide: "max-w-4xl",
  full: "max-w-6xl",
  bleed: "max-w-none",
};

const ASPECTS: Record<VideoData["aspectRatio"], string> = {
  video: "aspect-video",
  square: "aspect-square",
  portrait: "aspect-[4/5]",
  wide: "aspect-[21/9]",
};

type VideoSource =
  | { kind: "embed"; src: string }
  | { kind: "file"; src: string; type: string };

export function VideoBlock({ data }: { data: VideoData }) {
  const layout = data.layout ?? "centered";
  const width = data.width ?? "wide";
  const align = data.align ?? "center";
  const captionPosition = data.captionPosition ?? "below";
  const source = getVideoSource(data);
  const copy = (
    <VideoCopy data={data} align={layout === "split" ? "left" : align} />
  );
  const player = (
    <VideoFrame
      data={data}
      source={source}
      captionPosition={captionPosition}
    />
  );

  return (
    <section
      className={cn(
        "px-6 py-16 md:px-10",
        width === "bleed" && "px-0 md:px-0"
      )}
    >
      <div
        className={cn(
          "mx-auto",
          WIDTHS[width],
          layout === "split" &&
            "grid max-w-6xl items-center gap-8 lg:grid-cols-[0.85fr_1.15fr]",
          layout === "card" &&
            "rounded-3xl border border-zinc-200 bg-zinc-50 p-6 shadow-sm shadow-zinc-200/50 md:p-10",
          layout === "full" && "!max-w-none",
          layout !== "split" && align === "left" && "ml-0 mr-auto",
          layout !== "split" && align === "center" && "text-center",
          layout !== "split" && align === "left" && "text-left"
        )}
      >
        {layout === "split" ? (
          <>
            {copy}
            {player}
          </>
        ) : (
          <>
            {copy}
            <div className={cn(data.heading || data.subheading || data.eyebrow ? "mt-8" : "")}>
              {player}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function VideoCopy({
  data,
  align,
}: {
  data: VideoData;
  align: "left" | "center";
}) {
  if (
    !data.eyebrow &&
    !data.heading &&
    !data.subheading &&
    !data.buttonLabel
  ) {
    return null;
  }

  return (
    <div
      className={cn(
        "max-w-2xl",
        align === "center" && "mx-auto text-center",
        align === "left" && "text-left"
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
      {data.buttonLabel ? (
        <Link
          href={data.buttonHref || "#"}
          className="mt-5 inline-flex h-10 items-center rounded-lg bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          {data.buttonLabel}
        </Link>
      ) : null}
    </div>
  );
}

function VideoFrame({
  data,
  source,
  captionPosition,
}: {
  data: VideoData;
  source: VideoSource | null;
  captionPosition: VideoData["captionPosition"];
}) {
  const media = (
    <div
      className={cn(
        "relative overflow-hidden bg-zinc-950",
        ASPECTS[data.aspectRatio ?? "video"],
        frameClass(data.frame)
      )}
    >
      {source ? (
        source.kind === "file" ? (
          <video
            src={source.src}
            poster={data.posterUrl || undefined}
            controls={data.controls ?? true}
            autoPlay={data.autoplay}
            muted={data.muted || data.autoplay}
            loop={data.loop}
            playsInline
            className={cn(
              "h-full w-full",
              data.videoFit === "contain" ? "object-contain" : "object-cover"
            )}
          />
        ) : (
          <iframe
            src={source.src}
            title={data.heading || "Video"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="h-full w-full"
          />
        )
      ) : data.posterUrl ? (
        <>
          <BlockImage
            sizes={"100vw"}
            src={data.posterUrl}
            alt={data.posterAlt || data.heading || "Video poster"}
            className="h-full w-full object-cover opacity-80"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-zinc-950 shadow-lg">
              <Play className="ml-1 h-6 w-6 fill-current" />
            </span>
          </div>
        </>
      ) : (
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
          Add a video URL.
        </div>
      )}

      {data.caption && captionPosition === "overlay" ? (
        <p className="absolute inset-x-4 bottom-4 rounded-xl bg-zinc-950/75 px-4 py-3 text-left text-sm text-white backdrop-blur">
          {data.caption}
        </p>
      ) : null}
    </div>
  );

  return (
    <figure>
      {data.frame === "browser" ? (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl shadow-zinc-200/70">
          <div className="flex h-9 items-center gap-1.5 border-b border-zinc-100 bg-zinc-50 px-4">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </div>
          {media}
        </div>
      ) : (
        media
      )}

      {data.caption && captionPosition === "below" ? (
        <figcaption className="mt-3 text-sm leading-relaxed text-zinc-500">
          {data.caption}
        </figcaption>
      ) : null}
      {data.transcript ? (
        <details className="mt-4 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left">
          <summary className="cursor-pointer text-sm font-medium text-zinc-900">
            Transcript
          </summary>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-zinc-500">
            {data.transcript}
          </p>
        </details>
      ) : null}
    </figure>
  );
}

function getVideoSource(data: VideoData): VideoSource | null {
  const raw = data.url?.trim();
  if (!raw) return null;

  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(raw)) {
    const ext = raw.split("?")[0]?.split(".").pop()?.toLowerCase() || "mp4";
    return { kind: "file", src: raw, type: `video/${ext === "ogv" ? "ogg" : ext}` };
  }

  return { kind: "embed", src: toEmbedUrl(raw, data) };
}

function toEmbedUrl(raw: string, data: VideoData) {
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      return withVideoParams(
        `https://www.youtube.com/embed/${url.pathname.replace(/^\/+/, "")}`,
        data
      );
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = url.searchParams.get("v");
      if (id) return withVideoParams(`https://www.youtube.com/embed/${id}`, data);
      if (url.pathname.startsWith("/shorts/")) {
        return withVideoParams(
          `https://www.youtube.com/embed/${url.pathname.split("/")[2]}`,
          data
        );
      }
    }

    if (host === "vimeo.com") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      if (id) return withVideoParams(`https://player.vimeo.com/video/${id}`, data);
    }

    return withVideoParams(raw, data);
  } catch {
    return raw;
  }
}

function withVideoParams(src: string, data: VideoData) {
  try {
    const url = new URL(src);
    if (data.autoplay) url.searchParams.set("autoplay", "1");
    if (data.muted || data.autoplay) url.searchParams.set("muted", "1");
    if (data.loop) url.searchParams.set("loop", "1");
    if (data.controls === false) url.searchParams.set("controls", "0");
    return url.toString();
  } catch {
    return src;
  }
}

function frameClass(frame: VideoData["frame"]) {
  if (frame === "browser") return "rounded-none";
  if (frame === "none") return "rounded-none";
  if (frame === "border") return "rounded-2xl border border-zinc-200 p-1";
  if (frame === "shadow") return "rounded-2xl shadow-xl shadow-zinc-200/70";
  return "rounded-2xl";
}
