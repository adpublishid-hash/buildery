import type { StepsData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";

export function StepsBlock({ data }: { data: StepsData }) {
  const layout = data.layout ?? "horizontal";
  const tone = data.tone ?? "light";
  const centered = (data.align ?? "center") === "center";
  const inverse = tone === "dark";

  return (
    <section className="px-6 py-16 md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className={cn("max-w-3xl", centered && "mx-auto text-center")}>
          {data.eyebrow ? (
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
              {data.eyebrow}
            </p>
          ) : null}
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 md:text-4xl">
            {data.heading}
          </h2>
          {data.subheading ? (
            <p className="mt-3 text-base leading-relaxed text-zinc-500">
              {data.subheading}
            </p>
          ) : null}
        </div>

        <div
          className={cn(
            "mt-10",
            layout === "vertical" || layout === "timeline"
              ? "mx-auto max-w-3xl space-y-5"
              : "grid gap-5",
            layout !== "vertical" &&
              layout !== "timeline" &&
              (data.columns === 2
                ? "md:grid-cols-2"
                : data.columns === 4
                  ? "sm:grid-cols-2 lg:grid-cols-4"
                  : "sm:grid-cols-2 lg:grid-cols-3")
          )}
        >
          {data.items.map((item, i) => {
            const highlighted = item.highlighted;
            const darkCard = inverse || highlighted;
            const marker = getMarker(data.markerStyle ?? "number", item.icon, i);
            return (
              <div
                key={i}
                className={cn(
                  "relative min-w-0",
                  layout === "timeline" && "pl-10",
                  layout === "vertical" && "flex gap-4",
                  layout === "cards" &&
                    "rounded-2xl border border-zinc-200 bg-white p-6",
                  layout === "horizontal" &&
                    "rounded-2xl border border-zinc-200 bg-white p-6",
                  tone === "soft" &&
                    (layout === "cards" || layout === "horizontal") &&
                    "border-zinc-100 bg-zinc-50",
                  darkCard &&
                    (layout === "cards" || layout === "horizontal") &&
                    "border-zinc-950 bg-zinc-950 text-white shadow-xl shadow-zinc-900/15"
                )}
              >
                {layout === "timeline" ? (
                  <>
                    <span className="absolute bottom-0 left-4 top-10 w-px bg-zinc-200 last:hidden" />
                    <StepMarker
                      marker={marker}
                      dark={darkCard}
                      className="absolute left-0 top-0"
                    />
                  </>
                ) : (
                  <StepMarker
                    marker={marker}
                    dark={darkCard}
                    className={cn(
                      layout === "vertical" ? "shrink-0" : "mb-4",
                      centered && layout !== "vertical" && "mx-auto"
                    )}
                  />
                )}

                <div className={cn(layout === "vertical" && "min-w-0")}>
                  {item.eyebrow || item.meta ? (
                    <div
                      className={cn(
                        "mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-widest",
                        centered && layout !== "vertical" && "justify-center",
                        darkCard ? "text-zinc-300" : "text-zinc-500"
                      )}
                    >
                      {item.eyebrow ? <span>{item.eyebrow}</span> : null}
                      {item.meta ? (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 normal-case tracking-normal",
                            darkCard ? "bg-white/10 text-white" : "bg-zinc-100 text-zinc-700"
                          )}
                        >
                          {item.meta}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <h3
                    className={cn(
                      "text-base font-semibold",
                      darkCard ? "text-white" : "text-zinc-900",
                      centered && layout !== "vertical" && "text-center"
                    )}
                  >
                    {item.title}
                  </h3>
                  <p
                    className={cn(
                      "mt-2 text-sm leading-relaxed",
                      darkCard ? "text-zinc-200" : "text-zinc-500",
                      centered && layout !== "vertical" && "text-center"
                    )}
                  >
                    {item.description}
                  </p>
                  {item.linkLabel ? (
                    <a
                      href={item.linkHref || "#"}
                      className={cn(
                        "mt-4 inline-flex text-sm font-medium underline underline-offset-4",
                        darkCard ? "text-white" : "text-zinc-950"
                      )}
                    >
                      {item.linkLabel}
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function getMarker(style: StepsData["markerStyle"], icon: string, index: number) {
  if (style === "dot") return "";
  if (style === "icon" && icon) return icon;
  return String(index + 1);
}

function StepMarker({
  className,
  dark,
  marker,
}: {
  className?: string;
  dark: boolean;
  marker: string;
}) {
  return (
    <div
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold",
        dark ? "bg-white/10 text-white" : "text-white",
        className
      )}
      style={!dark ? { backgroundColor: "var(--bd-accent, #18181b)" } : undefined}
    >
      {marker}
    </div>
  );
}
