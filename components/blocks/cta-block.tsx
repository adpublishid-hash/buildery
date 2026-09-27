import type { CtaData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";
import { BlockImage } from "@/components/blocks/block-image";

export function CtaBlock({ data }: { data: CtaData }) {
  const layout = data.layout ?? "card";
  const tone = data.tone ?? "soft";
  const centered = data.align === "center";
  const hasImage = Boolean(data.imageUrl);
  const isBackground = layout === "background" && hasImage;
  const inverse =
    layout === "minimal"
      ? false
      : tone === "dark" || tone === "accent" || (isBackground && data.overlay !== "light");
  const heightClass = {
    compact: "py-8 md:py-10",
    normal: "py-12 md:py-14",
    large: "py-16 md:py-20",
  }[data.height ?? "normal"];
  const toneClass = {
    soft: "border-zinc-200 bg-zinc-50 text-zinc-950",
    light: "border-zinc-200 bg-white text-zinc-950",
    dark: "border-zinc-900 bg-zinc-950 text-white",
    accent: "border-zinc-950 bg-zinc-950 text-white",
  }[tone];
  const overlayClass = {
    none: "",
    light: "bg-white/75",
    dark: "bg-zinc-950/60",
  }[data.overlay ?? "dark"];
  const buttonStyle: Record<string, string> = {};
  if (data.buttonStyle === "solid") {
    if (data.buttonColor?.trim()) {
      buttonStyle.backgroundColor = data.buttonColor.trim();
    } else if (tone !== "accent" && tone !== "dark") {
      buttonStyle.backgroundColor = "var(--bd-accent, #18181b)";
    }
  }
  if (data.buttonTextColor?.trim()) {
    buttonStyle.color = data.buttonTextColor.trim();
  }

  return (
    <section className="px-6 py-12 md:px-10">
      <div className={cn("mx-auto", layout === "banner" ? "max-w-6xl" : "max-w-5xl")}>
        <div
          className={cn(
            "relative isolate overflow-hidden",
            layout !== "minimal" && "rounded-2xl border",
            heightClass,
            layout !== "minimal" && toneClass,
            layout === "banner" && "px-6 md:px-8",
            layout !== "banner" && "px-8",
            centered && layout !== "split" && "text-center",
            layout === "split" &&
              "grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]",
            layout === "split" && data.imagePosition === "left" && "md:[&>*:first-child]:order-2",
            layout === "banner" &&
              "flex flex-col gap-6 md:flex-row md:items-center md:justify-between",
            layout === "banner" && centered && "md:text-left"
          )}
        >
          {isBackground ? (
            <>
              <BlockImage
                sizes={"100vw"}
                src={data.imageUrl}
                alt={data.imageAlt || data.heading}
                className="absolute inset-0 -z-20 h-full w-full object-cover"
              />
              {overlayClass ? <div className={cn("absolute inset-0 -z-10", overlayClass)} /> : null}
            </>
          ) : null}

          <div
            className={cn(
              "min-w-0",
              (layout === "card" || layout === "minimal") && "mx-auto max-w-2xl",
              layout === "split" && "max-w-xl",
              layout === "banner" && "max-w-3xl"
            )}
          >
            {data.badge || data.eyebrow ? (
              <div
                className={cn(
                  "mb-4 flex flex-wrap items-center gap-2",
                  centered && layout !== "banner" && "justify-center"
                )}
              >
                {data.badge ? (
                  <span
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium",
                      inverse
                        ? "border-white/20 bg-white/10 text-white"
                        : "border-zinc-200 bg-white text-zinc-700"
                    )}
                  >
                    {data.badge}
                  </span>
                ) : null}
                {data.eyebrow ? (
                  <span className={cn("text-xs font-semibold uppercase tracking-widest", inverse ? "text-zinc-200" : "text-zinc-500")}>
                    {data.eyebrow}
                  </span>
                ) : null}
              </div>
            ) : null}

            <h2 className={cn("text-2xl font-semibold tracking-tight md:text-3xl", inverse ? "text-white" : "text-zinc-950")}>
              {data.heading}
            </h2>
            {data.description ? (
              <p className={cn("mt-3 text-base leading-relaxed", inverse ? "text-zinc-200" : "text-zinc-500")}>
                {data.description}
              </p>
            ) : null}
            {data.note ? (
              <p className={cn("mt-4 text-sm", inverse ? "text-zinc-300" : "text-zinc-500")}>
                {data.note}
              </p>
            ) : null}
          </div>

          <div
            className={cn(
              "flex flex-wrap gap-3",
              layout === "card" && "mt-7 justify-center",
              layout === "minimal" && "mt-7 justify-center",
              layout === "background" && "mt-7 justify-center",
              layout === "banner" && "shrink-0",
              centered && layout !== "banner" && "justify-center"
            )}
          >
            {data.buttonLabel ? (
              <a
                href={data.buttonHref || "#"}
                className={cn(
                  "inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-medium shadow-sm transition hover:opacity-90",
                  data.buttonStyle === "outline"
                    ? inverse
                      ? "border border-white/40 text-white"
                      : "border border-zinc-300 text-zinc-900"
                    : data.buttonStyle === "soft"
                      ? inverse
                        ? "bg-white/15 text-white"
                        : "bg-zinc-100 text-zinc-950"
                      : tone === "accent" || tone === "dark"
                        ? "bg-white text-zinc-950"
                        : "text-white"
                )}
                style={Object.keys(buttonStyle).length ? buttonStyle : undefined}
              >
                {data.buttonLabel}
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

          {layout === "split" && hasImage ? (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/10 shadow-xl shadow-zinc-900/10">
              <BlockImage
                sizes={"(min-width: 1024px) 50vw, 100vw"}
                src={data.imageUrl}
                alt={data.imageAlt || data.heading}
                className="aspect-[16/11] w-full object-cover"
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
