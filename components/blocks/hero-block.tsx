import type { HeroData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";
import { BlockImage } from "@/components/blocks/block-image";

export function HeroBlock({ data }: { data: HeroData }) {
  const layout = data.layout ?? "centered";
  const centered = data.align === "center";
  const hasVideo = Boolean(data.videoUrl);
  const hasMedia = Boolean(data.mediaUrl);
  const isBackground = layout === "background" && (hasMedia || hasVideo);
  const primaryButtonStyle: Record<string, string> = {};
  if (data.buttonStyle === "solid") {
    primaryButtonStyle.backgroundColor =
      data.buttonColor?.trim() || "var(--bd-accent, #18181b)";
  }
  if (data.buttonTextColor?.trim()) {
    primaryButtonStyle.color = data.buttonTextColor.trim();
  }
  const heightClass = {
    compact: "py-14 md:py-20",
    normal: "py-20 md:py-28",
    full: "min-h-[720px] py-24 md:py-32",
  }[data.height ?? "normal"];
  const overlayClass = {
    none: "",
    light: "bg-white/70",
    dark: "bg-zinc-950/55",
  }[data.overlay ?? "dark"];
  const inverse = isBackground && (data.overlay ?? "dark") === "dark";
  const stats = data.stats ?? [];

  return (
    <section
      className={cn(
        "relative isolate overflow-hidden px-6 md:px-10",
        heightClass,
        inverse ? "text-white" : "text-zinc-950"
      )}
    >
      {isBackground ? (
        <>
          {hasVideo ? (
            <video
              autoPlay
              muted
              loop
              playsInline
              poster={data.mediaUrl || undefined}
              className="absolute inset-0 -z-20 h-full w-full object-cover"
            >
              <source src={data.videoUrl} />
            </video>
          ) : (
            <BlockImage
              src={data.mediaUrl}
              alt={data.mediaAlt || data.heading}
              className="absolute inset-0 -z-20 h-full w-full object-cover"
              sizes="100vw"
              priority
            />
          )}
          {overlayClass ? (
            <div className={cn("absolute inset-0 -z-10", overlayClass)} />
          ) : null}
        </>
      ) : null}

      <div
        className={cn(
          "mx-auto max-w-6xl",
          layout === "split" &&
            "grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)] lg:gap-14",
          layout === "split" && data.mediaPosition === "left" && "md:[&>*:first-child]:order-2",
          layout !== "split" && "text-center",
          layout === "centered" && "max-w-4xl",
          layout === "media-top" && "max-w-5xl",
          layout === "card" &&
            "max-w-3xl rounded-3xl border border-zinc-200 bg-zinc-50 px-8 py-12 shadow-sm shadow-zinc-200/60 md:px-12 md:py-14",
          isBackground && "flex min-h-[inherit] items-center"
        )}
      >
        <div
          className={cn(
            "min-w-0",
            layout === "split" && centered && "md:text-left",
            layout !== "split" && "mx-auto max-w-3xl",
            isBackground && "mx-auto"
          )}
        >
          {data.badge || data.eyebrow ? (
            <div
              className={cn(
                "mb-4 flex flex-wrap items-center gap-2",
                layout !== "split" && "justify-center",
                layout === "split" && centered && "md:justify-start"
              )}
            >
              {data.badge ? (
                <span
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium",
                    inverse
                      ? "border-white/20 bg-white/10 text-white"
                      : "border-zinc-200 bg-zinc-50 text-zinc-700"
                  )}
                >
                  {data.badge}
                </span>
              ) : null}
              {data.eyebrow ? (
                <span
                  className={cn(
                    "text-xs font-semibold uppercase tracking-widest",
                    inverse ? "text-zinc-200" : "text-zinc-500"
                  )}
                >
                  {data.eyebrow}
                </span>
              ) : null}
            </div>
          ) : null}

          <h1
            className={cn(
              "text-4xl font-semibold tracking-tight md:text-6xl",
              inverse ? "text-white" : "text-zinc-950"
            )}
          >
            {data.heading}
          </h1>
          {data.subheading ? (
            <p
              className={cn(
                "mt-5 text-lg leading-relaxed md:text-xl",
                inverse ? "text-zinc-100" : "text-zinc-600"
              )}
            >
              {data.subheading}
            </p>
          ) : null}

          {data.primaryLabel || data.secondaryLabel ? (
            <div
              className={cn(
                "mt-8 flex flex-wrap gap-3",
                layout !== "split" && "justify-center",
                layout === "split" && centered && "md:justify-start"
              )}
            >
              {data.primaryLabel ? (
                <a
                  href={data.primaryHref || "#"}
                  className={cn(
                    "inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-medium shadow-sm transition hover:opacity-90",
                    data.buttonStyle === "outline"
                      ? inverse
                        ? "border border-white/50 text-white"
                        : "border border-zinc-300 text-zinc-900"
                      : data.buttonStyle === "soft"
                        ? inverse
                          ? "bg-white/15 text-white"
                          : "bg-zinc-100 text-zinc-950"
                        : "text-white"
                  )}
                  style={
                    Object.keys(primaryButtonStyle).length
                      ? primaryButtonStyle
                      : undefined
                  }
                >
                  {data.primaryLabel}
                </a>
              ) : null}
              {data.secondaryLabel ? (
                <a
                  href={data.secondaryHref || "#"}
                  className={cn(
                    "inline-flex items-center rounded-lg border px-5 py-2.5 text-sm font-medium transition",
                    inverse
                      ? "border-white/30 text-white hover:bg-white/10"
                      : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                  )}
                >
                  {data.secondaryLabel}
                </a>
              ) : null}
            </div>
          ) : null}

          {data.trustText ? (
            <p
              className={cn(
                "mt-6 text-sm",
                inverse ? "text-zinc-200" : "text-zinc-500"
              )}
            >
              {data.trustText}
            </p>
          ) : null}

          {stats.length > 0 ? (
            <div
              className={cn(
                "mt-8 grid gap-4 sm:grid-cols-3",
                layout !== "split" && "mx-auto max-w-2xl"
              )}
            >
              {stats.slice(0, 3).map((stat, index) => (
                <div
                  key={index}
                  className={cn(
                    "rounded-xl border p-4",
                    inverse
                      ? "border-white/15 bg-white/10"
                      : "border-zinc-200 bg-white/70"
                  )}
                >
                  <p className="text-2xl font-semibold">{stat.value}</p>
                  <p className={cn("mt-1 text-xs", inverse ? "text-zinc-200" : "text-zinc-500")}>
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {layout !== "background" && hasMedia ? (
          <figure
            className={cn(
              "overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl shadow-zinc-200/60",
              layout === "media-top" && "mt-10",
              layout === "split" && "min-w-0"
            )}
          >
            <BlockImage
              src={data.mediaUrl}
              alt={data.mediaAlt || data.heading}
              className="aspect-[16/11] w-full object-cover"
              sizes="(min-width: 1024px) 50vw, 100vw"
              priority
            />
            {data.mediaCaption ? (
              <figcaption className="border-t border-zinc-100 px-4 py-3 text-sm text-zinc-500">
                {data.mediaCaption}
              </figcaption>
            ) : null}
          </figure>
        ) : null}
      </div>
    </section>
  );
}
