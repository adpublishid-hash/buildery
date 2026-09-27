import { ArrowRight, Bell, CheckCircle2, Megaphone, Sparkles } from "lucide-react";

import type { BannerData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";

const WIDTHS: Record<BannerData["width"], string> = {
  narrow: "max-w-3xl",
  wide: "max-w-5xl",
  full: "max-w-6xl",
  bleed: "max-w-none",
};

const ICONS = {
  accent: Sparkles,
  dark: Megaphone,
  light: Bell,
  soft: Bell,
  success: CheckCircle2,
  warning: Megaphone,
} as const;

export function BannerBlock({ data }: { data: BannerData }) {
  // "ribbon" reuses all the slim "bar" internals, but renders full-bleed
  // edge-to-edge with square corners.
  const isRibbon = data.layout === "ribbon";
  const layout = isRibbon ? "bar" : (data.layout ?? "bar");
  const tone = data.tone ?? "accent";
  const width = data.width ?? "wide";
  const align = data.align ?? "center";
  const Icon = ICONS[tone];
  const hasHeading = Boolean(data.eyebrow || data.heading);

  return (
    <section
      className={cn(
        "px-6 py-3",
        width === "bleed" && "px-0",
        isRibbon && "px-0",
        layout !== "bar" && "py-8 md:py-10"
      )}
    >
      <div className={isRibbon ? "w-full" : cn("mx-auto", WIDTHS[width])}>
        <div
          className={cn(
            "relative overflow-hidden",
            shellClass(tone, layout),
            isRibbon && "!rounded-none",
            layout === "bar" &&
              "flex flex-col items-center justify-center gap-3 rounded-xl px-5 text-center text-sm sm:flex-row sm:text-left",
            layout === "bar" && (data.compact ? "py-2.5" : "py-3.5"),
            layout === "inline" &&
              "flex flex-col gap-4 rounded-2xl px-5 py-5 sm:flex-row sm:items-center sm:justify-between",
            layout === "card" &&
              "rounded-2xl px-6 py-8 text-center sm:px-10",
            layout === "split" &&
              "grid gap-6 rounded-2xl px-6 py-8 sm:px-10 lg:grid-cols-[1fr_auto] lg:items-center",
            align === "left" && layout === "card" && "text-left",
            align === "center" && layout === "card" && "text-center"
          )}
        >
          <div
            className={cn(
              "flex min-w-0 gap-3",
              layout === "bar" && "items-center",
              layout !== "bar" && align === "center" && layout === "card"
                ? "mx-auto max-w-2xl justify-center"
                : "max-w-3xl",
              layout === "card" && "flex-col items-center gap-4",
              layout === "card" && align === "left" && "items-start"
            )}
          >
            {data.showIcon !== false ? (
              <span
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-full",
                  layout === "bar" ? "h-7 w-7" : "h-10 w-10",
                  iconClass(tone)
                )}
              >
                {data.icon ? (
                  <span aria-hidden>{data.icon}</span>
                ) : (
                  <Icon className={layout === "bar" ? "h-3.5 w-3.5" : "h-5 w-5"} />
                )}
              </span>
            ) : null}

            <div className="min-w-0">
              {data.eyebrow || data.badge ? (
                <div
                  className={cn(
                    "mb-1 flex flex-wrap items-center gap-2",
                    layout === "card" && align === "center" && "justify-center"
                  )}
                >
                  {data.badge ? (
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider", badgeClass(tone))}>
                      {data.badge}
                    </span>
                  ) : null}
                  {data.eyebrow ? (
                    <span className={cn("text-xs font-medium", mutedTextClass(tone))}>
                      {data.eyebrow}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {data.heading ? (
                <h2
                  className={cn(
                    layout === "bar"
                      ? "text-sm font-semibold"
                      : "text-2xl font-semibold tracking-tight",
                    textClass(tone)
                  )}
                >
                  {data.heading}
                </h2>
              ) : null}

              {data.text ? (
                <p
                  className={cn(
                    hasHeading && layout !== "bar" ? "mt-2" : "",
                    layout === "bar" ? "text-sm" : "text-sm leading-relaxed sm:text-base",
                    data.heading && layout === "bar" ? mutedTextClass(tone) : textClass(tone)
                  )}
                >
                  {data.text}
                </p>
              ) : null}
            </div>
          </div>

          <div
            className={cn(
              "flex shrink-0 flex-wrap items-center gap-2",
              layout === "card" && "mt-6 justify-center",
              layout === "bar" && "justify-center"
            )}
          >
            {data.linkLabel ? (
              <a
                href={data.linkHref || "#"}
                className={cn(
                  "inline-flex h-9 items-center justify-center rounded-lg px-3.5 text-sm font-semibold transition",
                  primaryButtonClass(tone)
                )}
                target={isExternalHref(data.linkHref) ? "_blank" : undefined}
                rel={isExternalHref(data.linkHref) ? "noreferrer" : undefined}
              >
                {data.linkLabel}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </a>
            ) : null}
            {data.secondaryLabel ? (
              <a
                href={data.secondaryHref || "#"}
                className={cn(
                  "inline-flex h-9 items-center justify-center rounded-lg px-3.5 text-sm font-medium transition",
                  secondaryButtonClass(tone)
                )}
                target={isExternalHref(data.secondaryHref) ? "_blank" : undefined}
                rel={isExternalHref(data.secondaryHref) ? "noreferrer" : undefined}
              >
                {data.secondaryLabel}
              </a>
            ) : null}
            {data.dismissLabel ? (
              <span className={cn("text-xs", mutedTextClass(tone))}>
                {data.dismissLabel}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function shellClass(tone: BannerData["tone"], layout: BannerData["layout"]) {
  const rounded = layout === "bar" ? "" : "shadow-sm";
  if (tone === "dark") return cn("bg-zinc-950", rounded);
  if (tone === "light") return cn("border border-zinc-200 bg-white", rounded);
  if (tone === "soft") return cn("border border-zinc-200 bg-zinc-50", rounded);
  if (tone === "success") return cn("border border-emerald-200 bg-emerald-50", rounded);
  if (tone === "warning") return cn("border border-amber-200 bg-amber-50", rounded);
  return cn("bg-[var(--bd-accent,#18181b)]", rounded);
}

function textClass(tone: BannerData["tone"]) {
  if (tone === "dark" || tone === "accent") return "text-white";
  if (tone === "success") return "text-emerald-950";
  if (tone === "warning") return "text-amber-950";
  return "text-zinc-950";
}

function mutedTextClass(tone: BannerData["tone"]) {
  if (tone === "dark" || tone === "accent") return "text-white/75";
  if (tone === "success") return "text-emerald-700";
  if (tone === "warning") return "text-amber-700";
  return "text-zinc-500";
}

function iconClass(tone: BannerData["tone"]) {
  if (tone === "dark") return "bg-white/10 text-white";
  if (tone === "accent") return "bg-white/15 text-white";
  if (tone === "success") return "bg-emerald-100 text-emerald-700";
  if (tone === "warning") return "bg-amber-100 text-amber-700";
  return "bg-zinc-100 text-zinc-700";
}

function badgeClass(tone: BannerData["tone"]) {
  if (tone === "dark" || tone === "accent") return "bg-white/15 text-white";
  if (tone === "success") return "bg-emerald-100 text-emerald-800";
  if (tone === "warning") return "bg-amber-100 text-amber-800";
  return "bg-zinc-100 text-zinc-700";
}

function primaryButtonClass(tone: BannerData["tone"]) {
  if (tone === "dark" || tone === "accent") return "bg-white text-zinc-950 hover:bg-white/90";
  if (tone === "success") return "bg-emerald-700 text-white hover:bg-emerald-800";
  if (tone === "warning") return "bg-amber-700 text-white hover:bg-amber-800";
  return "bg-zinc-950 text-white hover:bg-zinc-800";
}

function secondaryButtonClass(tone: BannerData["tone"]) {
  if (tone === "dark" || tone === "accent") return "bg-white/10 text-white hover:bg-white/15";
  if (tone === "success") return "bg-emerald-100 text-emerald-900 hover:bg-emerald-200";
  if (tone === "warning") return "bg-amber-100 text-amber-900 hover:bg-amber-200";
  return "bg-zinc-100 text-zinc-900 hover:bg-zinc-200";
}

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}
