import type { LogosData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";
import { BlockImage } from "@/components/blocks/block-image";

export function LogosBlock({ data }: { data: LogosData }) {
  const layout = data.layout ?? "cloud";
  const tone = data.tone ?? "light";
  const centered = (data.align ?? "center") === "center";
  const inverse = tone === "dark";
  const logoSize = {
    sm: "h-6",
    md: "h-8",
    lg: "h-11",
  }[data.logoSize ?? "md"];

  return (
    <section className="px-6 py-14 md:px-10">
      <div className="mx-auto max-w-6xl">
        {data.eyebrow || data.heading || data.subheading ? (
          <div className={cn("mb-8 max-w-3xl", centered && "mx-auto text-center")}>
            {data.eyebrow ? (
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                {data.eyebrow}
              </p>
            ) : null}
            {data.heading ? (
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
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
            layout === "cloud" &&
              "flex flex-wrap items-center gap-x-10 gap-y-6",
            layout === "cloud" && centered && "justify-center",
            layout === "cloud" && !centered && "justify-start",
            layout === "strip" &&
              "flex flex-wrap items-center justify-center gap-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white",
            layout === "grid" &&
              "grid gap-4",
            layout === "cards" &&
              "grid gap-4",
            layout === "plain" &&
              "grid gap-x-8 gap-y-6",
            (layout === "grid" || layout === "cards" || layout === "plain") &&
              (data.columns === 3
                ? "sm:grid-cols-2 lg:grid-cols-3"
                : data.columns === 4
                  ? "sm:grid-cols-2 lg:grid-cols-4"
                  : "sm:grid-cols-2 lg:grid-cols-5"),
            tone === "dark" && layout !== "cloud" && layout !== "plain" && "border-zinc-900 bg-zinc-950",
            tone === "soft" && layout !== "cloud" && layout !== "plain" && "bg-zinc-50"
          )}
        >
          {data.items.map((item, i) => {
            const content = (
              <div
                className={cn(
                  "group flex min-w-0 items-center justify-center transition",
                  layout === "cards" &&
                    "min-h-28 flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 text-center",
                  layout === "grid" &&
                    "min-h-20 rounded-xl border border-zinc-200 bg-white p-4",
                  layout === "plain" &&
                    "min-h-16 p-3",
                  layout === "strip" &&
                    "min-h-20 flex-1 basis-40 border-b border-r border-zinc-200 p-4",
                  item.featured && "border-zinc-950 shadow-sm shadow-zinc-200",
                  inverse && "border-white/10 bg-white/5 text-white"
                )}
              >
                {item.url ? (
                  <BlockImage
                    sizes={"160px"}
                    src={item.url}
                    alt={item.name}
                    className={cn(
                      "w-auto max-w-full object-contain opacity-70 transition group-hover:opacity-100",
                      logoSize,
                      data.grayscale && "grayscale group-hover:grayscale-0"
                    )}
                  />
                ) : (
                  <span
                    className={cn(
                      "truncate text-lg font-semibold",
                      inverse ? "text-zinc-100" : "text-zinc-500"
                    )}
                  >
                    {item.name}
                  </span>
                )}
                {layout === "cards" && item.category ? (
                  <span className={cn("text-xs", inverse ? "text-zinc-400" : "text-zinc-500")}>
                    {item.category}
                  </span>
                ) : null}
              </div>
            );

            return item.href ? (
              <a key={i} href={item.href} className="block min-w-0">
                {content}
              </a>
            ) : (
              <div key={i} className="min-w-0">
                {content}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
