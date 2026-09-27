import Link from "next/link";

import type { ColumnsData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";
import { RichHtml } from "./rich-html";
import { BlockImage } from "@/components/blocks/block-image";

export function ColumnsBlock({ data }: { data: ColumnsData }) {
  const centered = data.align === "center";
  const gap = {
    sm: "gap-3",
    md: "gap-5",
    lg: "gap-8",
  }[data.gap];
  const columns = data.columns ?? 2;
  const layout = data.layout ?? "cards";
  const cardStyle = data.cardStyle ?? "outline";
  const verticalAlign = data.verticalAlign ?? "stretch";
  const visibleItems = data.items.slice(0, columns);

  return (
    <section className="px-6 py-12 md:px-10">
      <div className="mx-auto max-w-6xl">
        {data.heading || data.subheading ? (
          <div className={cn("mb-9 max-w-3xl", centered && "mx-auto text-center")}>
            {data.heading ? (
              <h2 className="text-3xl font-semibold tracking-tight text-[var(--bd-block-text-color,#18181b)] md:text-4xl">
                {data.heading}
              </h2>
            ) : null}
            {data.subheading ? (
              <p className="mt-3 text-base leading-relaxed text-zinc-600">
                {data.subheading}
              </p>
            ) : null}
          </div>
        ) : null}

        {layout === "timeline" ? (
          <ol className="relative mx-auto max-w-2xl space-y-8 border-l-2 border-zinc-200 pl-8">
            {visibleItems.map((item, index) => (
              <li key={index} className="relative min-w-0">
                <span className="absolute -left-[46px] top-0 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-950 text-xs font-semibold text-white ring-4 ring-white">
                  {index + 1}
                </span>
                {item.eyebrow || item.meta ? (
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    {item.eyebrow ? <span>{item.eyebrow}</span> : null}
                    {item.meta ? (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 normal-case tracking-normal text-zinc-700">
                        {item.meta}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {item.heading ? (
                  <h3 className="text-lg font-semibold text-zinc-900">{item.heading}</h3>
                ) : null}
                <div className="mt-2 text-sm leading-relaxed text-zinc-600">
                  <RichHtml html={item.body.includes("<") ? item.body : `<p>${item.body}</p>`} />
                </div>
                {item.buttonLabel ? (
                  <Link
                    href={item.buttonHref || "#"}
                    className="mt-3 inline-flex text-sm font-medium text-zinc-950 underline underline-offset-4"
                  >
                    {item.buttonLabel}
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
        <div
          className={cn(
            "grid",
            gap,
            verticalAlign === "center" && "items-center",
            verticalAlign === "stretch" && "items-stretch",
            columns === 4
              ? "sm:grid-cols-2 lg:grid-cols-4"
              : columns === 3
                ? "md:grid-cols-3"
                : "md:grid-cols-2"
          )}
        >
          {visibleItems.map((item, index) => (
            <div
              key={index}
              className={cn(
                "group relative min-w-0 overflow-hidden rounded-2xl transition",
                layout === "plain"
                  ? "p-0"
                  : "p-5 md:p-6",
                layout !== "plain" &&
                  cardStyle === "outline" &&
                  "border border-zinc-200 bg-white",
                layout !== "plain" &&
                  cardStyle === "soft" &&
                  "bg-zinc-50",
                layout !== "plain" &&
                  cardStyle === "elevated" &&
                  "border border-zinc-100 bg-white shadow-sm shadow-zinc-200/70",
                item.highlighted &&
                  "border-zinc-950 bg-zinc-950 text-white shadow-xl shadow-zinc-900/15"
              )}
            >
              {layout === "media" && item.imageUrl ? (
                <div className="-mx-5 -mt-5 mb-5 overflow-hidden bg-zinc-100 md:-mx-6 md:-mt-6">
                  <BlockImage
                    sizes={"(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"}
                    src={item.imageUrl}
                    alt={item.imageAlt || item.heading || "Column image"}
                    className="aspect-[16/10] w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                  />
                </div>
              ) : null}

              <div
                className={cn(
                  "flex",
                  layout === "numbered" ? "items-start gap-4" : "flex-col"
                )}
              >
                {layout === "numbered" ? (
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                      item.highlighted
                        ? "bg-white text-zinc-950"
                        : "bg-zinc-950 text-white"
                    )}
                  >
                    {index + 1}
                  </span>
                ) : item.icon ? (
                  <span
                    className={cn(
                      "mb-4 flex h-11 w-11 items-center justify-center rounded-2xl text-xl",
                      item.highlighted
                        ? "bg-white/10 text-white"
                        : "bg-zinc-100 text-zinc-950"
                    )}
                  >
                    {item.icon}
                  </span>
                ) : null}

                <div className="min-w-0">
                  {item.eyebrow || item.meta ? (
                    <div
                      className={cn(
                        "mb-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide",
                        item.highlighted ? "text-zinc-300" : "text-zinc-500"
                      )}
                    >
                      {item.eyebrow ? <span>{item.eyebrow}</span> : null}
                      {item.meta ? (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 normal-case tracking-normal",
                            item.highlighted
                              ? "bg-white/10 text-white"
                              : "bg-zinc-100 text-zinc-700"
                          )}
                        >
                          {item.meta}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {item.heading ? (
                    <h3
                      className={cn(
                        "text-lg font-semibold",
                        item.highlighted ? "text-white" : "text-zinc-900"
                      )}
                    >
                      {item.heading}
                    </h3>
                  ) : null}
                  <div
                    className={cn(
                      "mt-3 text-sm leading-relaxed",
                      item.highlighted ? "text-zinc-200" : "text-zinc-600"
                    )}
                  >
                    <RichHtml html={item.body.includes("<") ? item.body : `<p>${item.body}</p>`} />
                  </div>
                  {item.buttonLabel ? (
                    <Link
                      href={item.buttonHref || "#"}
                      className={cn(
                        "mt-5 inline-flex text-sm font-medium underline underline-offset-4",
                        item.highlighted ? "text-white" : "text-zinc-950"
                      )}
                    >
                      {item.buttonLabel}
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </section>
  );
}
