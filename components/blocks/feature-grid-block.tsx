import type { FeatureGridData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";
import { BlockImage } from "@/components/blocks/block-image";

export function FeatureGridBlock({ data }: { data: FeatureGridData }) {
  const layout = data.layout ?? "cards";
  const cardStyle = data.cardStyle ?? "outline";
  const centered = (data.align ?? "center") === "center";

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

        {layout === "list" ? (
          <div className="mx-auto mt-10 max-w-3xl divide-y divide-zinc-200 border-y border-zinc-200">
            {data.items.map((item, i) => (
              <div key={i} className="flex gap-5 py-6">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-sm font-semibold text-zinc-950"
                  style={
                    data.iconStyle === "accent"
                      ? { backgroundColor: "var(--bd-accent, #18181b)", color: "white" }
                      : undefined
                  }
                >
                  {data.iconStyle === "symbol" && item.icon ? item.icon : i + 1}
                </div>
                <div className="min-w-0">
                  {item.eyebrow ? (
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                      {item.eyebrow}
                    </p>
                  ) : null}
                  <h3 className="text-base font-semibold text-zinc-900">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
                    {item.description}
                  </p>
                  {item.linkLabel ? (
                    <a
                      href={item.linkHref || "#"}
                      className="mt-3 inline-flex text-sm font-medium text-zinc-950 underline underline-offset-4"
                    >
                      {item.linkLabel}
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
        <div
          className={cn(
            "mt-10 grid gap-5",
            data.columns === 4
              ? "sm:grid-cols-2 lg:grid-cols-4"
              : data.columns === 3
                ? "sm:grid-cols-2 lg:grid-cols-3"
                : "md:grid-cols-2"
          )}
        >
          {data.items.map((item, i) => {
            const highlighted = item.highlighted;
            return (
              <div
                key={i}
                className={cn(
                  "group relative min-w-0 overflow-hidden rounded-2xl transition",
                  layout === "minimal" ? "p-0" : "p-5 md:p-6",
                  layout !== "minimal" &&
                    cardStyle === "outline" &&
                    "border border-zinc-200 bg-white",
                  layout !== "minimal" &&
                    cardStyle === "soft" &&
                    "bg-zinc-50",
                  layout !== "minimal" &&
                    cardStyle === "elevated" &&
                    "border border-zinc-100 bg-white shadow-sm shadow-zinc-200/70",
                  highlighted &&
                    "border-zinc-950 bg-zinc-950 text-white shadow-xl shadow-zinc-900/15"
                )}
              >
                {layout === "media" && item.imageUrl ? (
                  <div className="-mx-5 -mt-5 mb-5 overflow-hidden bg-zinc-100 md:-mx-6 md:-mt-6">
                    <BlockImage
                      sizes={"(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"}
                      src={item.imageUrl}
                      alt={item.imageAlt || item.title}
                      className="aspect-[16/10] w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    />
                  </div>
                ) : null}

                <div className={cn(layout === "icons" && "flex gap-4")}>
                  {layout !== "media" && layout !== "minimal" ? (
                    <div
                      className={cn(
                        "mb-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold",
                        layout === "icons" && "mb-0",
                        highlighted
                          ? "bg-white/10 text-white"
                          : "bg-zinc-100 text-zinc-950"
                      )}
                      style={
                        !highlighted && data.iconStyle === "accent"
                          ? {
                              backgroundColor: "var(--bd-accent, #18181b)",
                              color: "white",
                            }
                          : undefined
                      }
                    >
                      {data.iconStyle === "symbol" && item.icon
                        ? item.icon
                        : i + 1}
                    </div>
                  ) : null}

                  <div className="min-w-0">
                    {item.eyebrow ? (
                      <p
                        className={cn(
                          "mb-2 text-[11px] font-semibold uppercase tracking-widest",
                          highlighted ? "text-zinc-300" : "text-zinc-500"
                        )}
                      >
                        {item.eyebrow}
                      </p>
                    ) : null}
                    <h3
                      className={cn(
                        "text-base font-semibold",
                        highlighted ? "text-white" : "text-zinc-900"
                      )}
                    >
                      {item.title}
                    </h3>
                    <p
                      className={cn(
                        "mt-2 text-sm leading-relaxed",
                        highlighted ? "text-zinc-200" : "text-zinc-500"
                      )}
                    >
                      {item.description}
                    </p>
                    {item.linkLabel ? (
                      <a
                        href={item.linkHref || "#"}
                        className={cn(
                          "mt-5 inline-flex text-sm font-medium underline underline-offset-4",
                          highlighted ? "text-white" : "text-zinc-950"
                        )}
                      >
                        {item.linkLabel}
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>
    </section>
  );
}
