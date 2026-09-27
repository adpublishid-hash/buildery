import Link from "next/link";
import { ArrowRight, ChevronDown, MessageCircle, Plus } from "lucide-react";

import type { FaqData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";
import { FaqDetails } from "./faq-details";
import { RichHtml } from "./rich-html";

type FaqItem = FaqData["items"][number];

export function FaqBlock({ data }: { data: FaqData }) {
  const layout = data.layout ?? "single";
  const align = data.align ?? "center";
  const categories = uniqueCategories(data.items);

  return (
    <section
      className={cn(
        "px-4 py-16 sm:px-6 md:px-10 md:py-24",
        data.tone === "soft" && "bg-zinc-50/70"
      )}
    >
      <div
        className={cn(
          "mx-auto",
          layout === "split" || layout === "two-column" || layout === "grid"
            ? "max-w-6xl"
            : "max-w-4xl"
        )}
      >
        <div
          className={cn(
            layout === "split"
              ? "grid gap-8 lg:grid-cols-[0.8fr_1.2fr]"
              : "space-y-10"
          )}
        >
          <div
            className={cn(
              "max-w-2xl",
              layout !== "split" && align === "center" && "mx-auto text-center",
              layout !== "split" && align === "left" && "text-left"
            )}
          >
            {data.eyebrow ? (
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                {data.eyebrow}
              </p>
            ) : null}
            {data.heading ? (
              <h2 className="text-3xl font-semibold leading-tight tracking-tight text-zinc-950 md:text-4xl">
                {data.heading}
              </h2>
            ) : null}
            {data.subheading ? (
              <p className="mt-3 text-base leading-relaxed text-zinc-500">
                {data.subheading}
              </p>
            ) : null}
            {data.searchPlaceholder ? (
              <div className="mt-5 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-400">
                {data.searchPlaceholder}
              </div>
            ) : null}
            {data.ctaText || data.ctaLabel ? (
              <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
                    <MessageCircle className="h-4 w-4" />
                  </span>
                  {data.ctaText ? (
                    <p className="leading-relaxed text-zinc-600">{data.ctaText}</p>
                  ) : null}
                </div>
                {data.ctaLabel ? (
                  <Link
                    href={data.ctaHref || "#"}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 font-semibold text-white transition hover:bg-zinc-800"
                  >
                    {data.ctaLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>

          <div>
            {data.showCategories && categories.length > 0 ? (
              <div className="mb-5 flex flex-wrap gap-2">
                {categories.map((category) => (
                  <span
                    key={category}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600"
                  >
                    {category}
                  </span>
                ))}
              </div>
            ) : null}

            <div
              className={cn(
                layout === "two-column" &&
                  "columns-1 gap-4 md:columns-2",
                layout === "grid" && "grid gap-4 md:grid-cols-2 md:items-start",
                layout === "cards" && "grid gap-4",
                layout !== "two-column" &&
                  layout !== "cards" &&
                  layout !== "grid" &&
                  "space-y-3"
              )}
            >
              {data.items.map((item, index) => (
                <FaqRow
                  key={`${item.question}-${index}`}
                  data={data}
                  item={item}
                  index={index}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FaqRow({
  data,
  item,
  index,
}: {
  data: FaqData;
  item: FaqItem;
  index: number;
}) {
  const anchor = item.anchor || slugifyQuestion(item.question);
  const iconStyle = data.iconStyle ?? "plus";
  const category = data.showCategories ? item.category : "";
  // "grid" lays rows out as boxed cards in 2 columns, so plain rows get a border.
  const tone =
    data.layout === "grid" && data.tone === "plain" ? "bordered" : data.tone;

  return (
    <FaqDetails
      id={anchor}
      className={cn(
        "group mb-4 w-full scroll-mt-24 overflow-hidden align-top transition duration-200",
        rowClass(tone, item.highlighted),
        (data.layout === "two-column" || data.layout === "grid") &&
          "inline-block break-inside-avoid"
      )}
      open={item.defaultOpen}
      allowMultipleOpen={data.allowMultipleOpen ?? true}
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 gap-3">
          {iconStyle === "number" ? (
            <span className="mt-0.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-500">
              {index + 1}
            </span>
          ) : item.icon ? (
            <span className="mt-0.5 text-base" aria-hidden>
              {item.icon}
            </span>
          ) : null}
          <span>
            {category ? (
              <span className="mb-1 block text-xs font-medium text-zinc-400">
                {category}
              </span>
            ) : null}
            <span className="block text-sm font-semibold leading-6 text-zinc-900">
              {item.question}
            </span>
          </span>
        </span>
        {iconStyle === "plus" ? (
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition group-open:rotate-45 group-open:border-white/20 group-open:bg-white/10 group-open:text-white">
            <Plus className="h-4 w-4" />
          </span>
        ) : iconStyle === "chevron" ? (
          <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-zinc-400 transition-transform group-open:rotate-180" />
        ) : null}
      </summary>
      {data.answerStyle === "rich" ? (
        <div className="prose prose-sm mt-3 max-w-none text-zinc-500 prose-a:text-zinc-900">
          <RichHtml html={item.answer} />
        </div>
      ) : (
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-zinc-500">
          {item.answer}
        </p>
      )}
    </FaqDetails>
  );
}

function rowClass(tone: FaqData["tone"], highlighted = false) {
  if (highlighted) {
    return "rounded-2xl border border-zinc-300 bg-white p-5 text-zinc-950 shadow-sm hover:border-zinc-400 open:border-zinc-950 open:bg-zinc-950 open:text-white open:[&_summary_span]:text-white open:[&_p]:text-zinc-300";
  }
  if (tone === "soft") return "rounded-2xl border border-zinc-200 bg-white p-5 text-zinc-950 shadow-sm hover:border-zinc-300 open:border-zinc-950 open:bg-zinc-950 open:text-white open:[&_summary_span]:text-white open:[&_p]:text-zinc-300";
  if (tone === "bordered") return "rounded-2xl border border-zinc-200 bg-white p-5 text-zinc-950 shadow-sm hover:border-zinc-400 open:border-zinc-950 open:bg-zinc-950 open:text-white open:[&_summary_span]:text-white open:[&_p]:text-zinc-300";
  if (tone === "accent") return "rounded-2xl border border-zinc-200 bg-[color-mix(in_srgb,var(--bd-accent)_8%,white)] p-5 text-zinc-950 shadow-sm open:border-zinc-950 open:bg-zinc-950 open:text-white open:[&_summary_span]:text-white open:[&_p]:text-zinc-300";
  return "border-b border-zinc-200 py-5";
}

function uniqueCategories(items: FaqItem[]) {
  return Array.from(
    new Set(items.map((item) => item.category.trim()).filter(Boolean))
  );
}

function slugifyQuestion(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "faq"
  );
}
