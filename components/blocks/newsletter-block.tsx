import Link from "next/link";
import { CheckCircle2, Mail } from "lucide-react";

import type { NewsletterData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";
import { BlockImage } from "@/components/blocks/block-image";

const WIDTHS: Record<NewsletterData["width"], string> = {
  narrow: "max-w-3xl",
  wide: "max-w-5xl",
  full: "max-w-6xl",
};

export function NewsletterBlock({ data }: { data: NewsletterData }) {
  const layout = data.layout ?? "card";
  const align = data.align ?? "center";
  const isSplit = layout === "split";
  const isMinimal = layout === "minimal";
  const isInline = layout === "inline";
  const isRow = layout === "banner" || isInline;

  return (
    <section className="px-6 py-16 md:px-10">
      <div className={cn("mx-auto", WIDTHS[data.width ?? "wide"])}>
        <div
          className={cn(
            "overflow-hidden",
            !isMinimal && !isInline && "rounded-2xl",
            shellClass(data.tone, layout),
            isSplit && "grid items-stretch lg:grid-cols-[1fr_0.9fr]",
            layout === "banner" && "px-5 py-5 sm:px-7",
            layout === "card" && (data.compact ? "px-5 py-7 sm:px-8" : "px-6 py-10 sm:px-10"),
            isMinimal && "mx-auto max-w-2xl"
          )}
        >
          <div
            className={cn(
              isSplit ? "p-6 sm:p-10" : "",
              isRow &&
                "flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between",
              isMinimal && align === "center" && "text-center",
              !isSplit && !isRow && align === "center" && "text-center"
            )}
          >
            <div className={cn(isRow && "max-w-2xl")}>
              {data.eyebrow ? (
                <p className={cn("mb-2 text-xs font-semibold uppercase tracking-widest", eyebrowClass(data.tone))}>
                  {data.eyebrow}
                </p>
              ) : null}
              {data.heading ? (
                <h2 className={cn("text-2xl font-semibold tracking-tight sm:text-3xl", headingClass(data.tone))}>
                  {data.heading}
                </h2>
              ) : null}
              {data.description ? (
                <p className={cn("mt-3 text-sm leading-relaxed sm:text-base", bodyClass(data.tone), align === "center" && !isSplit && "mx-auto max-w-xl")}>
                  {data.description}
                </p>
              ) : null}
              {data.note ? (
                <p className={cn("mt-3 inline-flex items-center gap-1.5 text-xs", bodyClass(data.tone))}>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {data.note}
                </p>
              ) : null}
            </div>

            <div className={cn(isRow ? "w-full lg:max-w-md" : "mt-6", !isSplit && !isRow && align === "center" && "mx-auto max-w-md")}>
              <NewsletterFormPreview data={data} />
              {data.secondaryLabel ? (
                <Link
                  href={data.secondaryHref || "#"}
                  className={cn("mt-3 inline-flex text-sm font-medium underline underline-offset-4", linkClass(data.tone))}
                >
                  {data.secondaryLabel}
                </Link>
              ) : null}
            </div>
          </div>

          {isSplit ? (
            <div className="relative min-h-72 bg-zinc-100">
              {data.imageUrl ? (
                <BlockImage
                  sizes={"(min-width: 1024px) 50vw, 100vw"}
                  src={data.imageUrl}
                  alt={data.imageAlt}
                  className="h-full min-h-72 w-full object-cover"
                />
              ) : (
                <div className="flex h-full min-h-72 items-center justify-center">
                  <Mail className="h-12 w-12 text-zinc-300" />
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function NewsletterFormPreview({ data }: { data: NewsletterData }) {
  const hasName = data.fields === "name-email";
  const method = data.formAction ? "post" : undefined;

  return (
    <form
      action={data.formAction || undefined}
      method={method}
      className="space-y-2"
    >
      {hasName ? (
        <input
          name="name"
          type="text"
          placeholder={data.namePlaceholder}
          className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-4 text-sm text-zinc-700 outline-none transition focus:border-zinc-400"
        />
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          name="email"
          type="email"
          required
          placeholder={data.placeholder}
          className="h-11 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-4 text-sm text-zinc-700 outline-none transition focus:border-zinc-400"
        />
        <button
          type="submit"
          className={cn(
            "inline-flex h-11 items-center justify-center rounded-lg px-5 text-sm font-medium transition",
            buttonClass(data.buttonStyle, data.tone)
          )}
        >
          {data.buttonLabel}
        </button>
      </div>
      {data.showConsent && data.consentLabel ? (
        <label className={cn("flex gap-2 text-left text-xs leading-relaxed", bodyClass(data.tone))}>
          <input type="checkbox" required className="mt-0.5" />
          <span>{data.consentLabel}</span>
        </label>
      ) : null}
      {data.privacyText ? (
        <p className={cn("text-xs leading-relaxed", bodyClass(data.tone))}>
          {data.privacyText}
        </p>
      ) : null}
      {data.provider !== "internal" || data.formAction ? (
        <p className={cn("text-[11px]", bodyClass(data.tone))}>
          Connected via {providerLabel(data.provider)}
        </p>
      ) : null}
    </form>
  );
}

function shellClass(tone: NewsletterData["tone"], layout: NewsletterData["layout"]) {
  if (layout === "minimal" || layout === "inline") return "";
  if (tone === "dark") return "border border-zinc-900 bg-zinc-950";
  if (tone === "accent") return "border border-zinc-200 bg-[color-mix(in_srgb,var(--bd-accent)_10%,white)]";
  if (tone === "light") return "border border-zinc-200 bg-white shadow-sm";
  return "border border-zinc-200 bg-zinc-50";
}

function headingClass(tone: NewsletterData["tone"]) {
  return tone === "dark" ? "text-white" : "text-zinc-900";
}

function bodyClass(tone: NewsletterData["tone"]) {
  return tone === "dark" ? "text-zinc-300" : "text-zinc-500";
}

function eyebrowClass(tone: NewsletterData["tone"]) {
  return tone === "dark" ? "text-zinc-400" : "text-zinc-500";
}

function linkClass(tone: NewsletterData["tone"]) {
  return tone === "dark" ? "text-white" : "text-zinc-950";
}

function buttonClass(
  style: NewsletterData["buttonStyle"],
  tone: NewsletterData["tone"]
) {
  if (style === "outline") {
    return tone === "dark"
      ? "border border-white/30 text-white hover:bg-white/10"
      : "border border-zinc-300 text-zinc-950 hover:bg-zinc-100";
  }
  if (style === "soft") {
    return tone === "dark"
      ? "bg-white/10 text-white hover:bg-white/15"
      : "bg-zinc-100 text-zinc-950 hover:bg-zinc-200";
  }
  return "bg-[var(--bd-accent,#18181b)] text-white hover:opacity-90";
}

function providerLabel(provider: NewsletterData["provider"]) {
  if (provider === "mailchimp") return "Mailchimp";
  if (provider === "convertkit") return "ConvertKit";
  if (provider === "custom") return "custom form action";
  return "internal capture";
}
