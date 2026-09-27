import { Check, X } from "lucide-react";

import type { PricingData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";

export function PricingBlock({ data }: { data: PricingData }) {
  const layout = data.layout ?? "cards";
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
          {data.billingNote ? (
            <p className="mt-3 text-sm text-zinc-400">{data.billingNote}</p>
          ) : null}
        </div>

        <div
          className={cn(
            "mt-10 grid gap-5",
            data.columns === 2
              ? "md:grid-cols-2"
              : data.columns === 4
                ? "sm:grid-cols-2 lg:grid-cols-4"
                : "md:grid-cols-3"
          )}
        >
          {data.plans.map((plan, i) => {
            const highlighted = plan.highlighted || (layout === "featured" && i === 1);
            const darkCard = layout === "minimal" ? false : inverse || highlighted;
            return (
              <div
                key={i}
                className={cn(
                  "relative flex min-w-0 flex-col p-6",
                  layout !== "minimal" && "rounded-2xl border",
                  layout !== "minimal" && tone === "light" && "border-zinc-200 bg-white",
                  layout !== "minimal" && tone === "soft" && "border-zinc-100 bg-zinc-50",
                  layout !== "minimal" && inverse && "border-zinc-900 bg-zinc-950 text-white",
                  layout !== "minimal" &&
                    highlighted &&
                    "border-zinc-950 bg-zinc-950 text-white shadow-xl shadow-zinc-900/15",
                  layout === "minimal" && highlighted && "rounded-2xl bg-zinc-50",
                  layout === "compact" && "p-5",
                  highlighted && layout === "featured" && "md:-mt-4 md:pb-10 md:pt-8"
                )}
              >
                {plan.badge || highlighted ? (
                  <span
                    className={cn(
                      "mb-4 inline-flex w-fit rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
                      darkCard
                        ? "bg-white/10 text-white"
                        : "bg-zinc-950 text-white"
                    )}
                    style={
                      !darkCard
                        ? { backgroundColor: "var(--bd-accent, #18181b)" }
                        : undefined
                    }
                  >
                    {plan.badge || "Most popular"}
                  </span>
                ) : null}

                <h3 className={cn("text-base font-semibold", darkCard ? "text-white" : "text-zinc-900")}>
                  {plan.name}
                </h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className={cn("text-4xl font-semibold tracking-tight", darkCard ? "text-white" : "text-zinc-900")}>
                    {plan.price}
                  </span>
                  <span className={cn("text-sm", darkCard ? "text-zinc-300" : "text-zinc-500")}>
                    {plan.period}
                  </span>
                </div>
                {plan.description ? (
                  <p className={cn("mt-2 text-sm leading-relaxed", darkCard ? "text-zinc-300" : "text-zinc-500")}>
                    {plan.description}
                  </p>
                ) : null}
                {plan.note ? (
                  <p className={cn("mt-3 text-xs", darkCard ? "text-zinc-300" : "text-zinc-400")}>
                    {plan.note}
                  </p>
                ) : null}

                <ul className="mt-6 flex-1 space-y-3">
                  {plan.features.map((feature, fi) => (
                    <li
                      key={fi}
                      className={cn("flex items-start gap-2 text-sm", darkCard ? "text-zinc-200" : "text-zinc-600")}
                    >
                      <Check className={cn("mt-0.5 h-4 w-4 shrink-0", darkCard ? "text-white" : "text-emerald-600")} />
                      <span>{feature}</span>
                    </li>
                  ))}
                  {(plan.excludedFeatures ?? []).map((feature, fi) => (
                    <li
                      key={`excluded-${fi}`}
                      className={cn("flex items-start gap-2 text-sm", darkCard ? "text-zinc-500" : "text-zinc-400")}
                    >
                      <X className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-7 space-y-2">
                  <a
                    href={plan.ctaHref || "#"}
                    className={cn(
                      "inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition",
                      darkCard
                        ? "bg-white text-zinc-950 hover:opacity-90"
                        : "text-white shadow-sm hover:opacity-90"
                    )}
                    style={
                      darkCard
                        ? undefined
                        : { backgroundColor: "var(--bd-accent, #18181b)" }
                    }
                  >
                    {plan.ctaLabel}
                  </a>
                  {plan.secondaryLabel ? (
                    <a
                      href={plan.secondaryHref || "#"}
                      className={cn(
                        "inline-flex w-full items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-medium transition",
                        darkCard
                          ? "border-white/20 text-white hover:bg-white/10"
                          : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                      )}
                    >
                      {plan.secondaryLabel}
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
