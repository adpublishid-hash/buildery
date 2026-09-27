import type { StatsData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";

export function StatsBlock({ data }: { data: StatsData }) {
  const layout = data.layout ?? "cards";
  const tone = data.tone ?? "light";
  const centered = (data.align ?? "center") === "center";
  const inverse = tone === "dark" || tone === "accent";

  return (
    <section className="px-6 py-16 md:px-10">
      <div
        className={cn(
          "mx-auto max-w-6xl",
          layout === "split" && "grid items-start gap-10 lg:grid-cols-[0.8fr_1.2fr]"
        )}
      >
        {data.heading || data.subheading || data.eyebrow ? (
          <div
            className={cn(
              "max-w-3xl",
              centered && layout !== "split" && "mx-auto text-center"
            )}
          >
            {data.eyebrow ? (
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
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

        <div
          className={cn(
            layout === "split" ? "mt-0" : "mt-10",
            layout === "strip" &&
              "grid overflow-hidden rounded-2xl border border-zinc-200 bg-white sm:grid-cols-2",
            layout === "inline" &&
              "flex flex-col divide-y divide-zinc-200 sm:flex-row sm:items-center sm:justify-center sm:divide-x sm:divide-y-0",
            layout !== "strip" &&
              layout !== "inline" &&
              "grid gap-5",
            layout !== "strip" &&
              layout !== "inline" &&
              (data.columns === 2
                ? "md:grid-cols-2"
                : data.columns === 3
                  ? "sm:grid-cols-2 lg:grid-cols-3"
                  : "sm:grid-cols-2 lg:grid-cols-4")
          )}
        >
          {data.items.map((item, i) => {
            const highlighted = item.highlighted;
            const darkCard = inverse || (highlighted && layout !== "inline");
            return (
              <div
                key={i}
                className={cn(
                  "min-w-0",
                  layout === "minimal" ? "p-0" : layout === "inline" ? "px-8 py-4 text-center sm:py-2" : "p-6",
                  layout === "strip" && "border-b border-zinc-200 sm:border-r lg:border-b-0",
                  layout !== "strip" &&
                    layout !== "minimal" &&
                    layout !== "inline" &&
                    "rounded-2xl border",
                  tone === "light" && layout !== "minimal" && layout !== "inline" && "border-zinc-200 bg-white",
                  tone === "soft" && layout !== "minimal" && layout !== "inline" && "border-zinc-100 bg-zinc-50",
                  inverse && layout !== "minimal" && layout !== "inline" && "border-zinc-900 bg-zinc-950 text-white",
                  highlighted && layout !== "inline" && "border-zinc-950 bg-zinc-950 text-white shadow-xl shadow-zinc-900/15",
                  centered && "text-center"
                )}
              >
                {item.icon ? (
                  <div
                    className={cn(
                      "mb-4 flex h-10 w-10 items-center justify-center rounded-2xl text-lg",
                      centered && "mx-auto",
                      darkCard ? "bg-white/10 text-white" : "bg-zinc-100 text-zinc-950"
                    )}
                  >
                    {item.icon}
                  </div>
                ) : null}
                <p
                  className={cn(
                    "text-4xl font-semibold tracking-tight",
                    darkCard ? "text-white" : "text-zinc-950"
                  )}
                >
                  {item.value}
                </p>
                <p className={cn("mt-2 text-sm font-medium", darkCard ? "text-zinc-200" : "text-zinc-700")}>
                  {item.label}
                </p>
                {item.description ? (
                  <p className={cn("mt-2 text-sm leading-relaxed", darkCard ? "text-zinc-300" : "text-zinc-500")}>
                    {item.description}
                  </p>
                ) : null}
                {item.trend ? (
                  <p
                    className={cn(
                      "mt-4 inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                      darkCard ? "bg-white/10 text-white" : "bg-emerald-50 text-emerald-700"
                    )}
                  >
                    {item.trend}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
