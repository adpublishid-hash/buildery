import Link from "next/link";
import {
  ArrowRight,
  BadgePercent,
  CheckCircle2,
  Clock3,
  HandCoins,
  ImageIcon,
  Landmark,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

import type { AffiliateCtaData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";
import { BlockImage } from "@/components/blocks/block-image";

const WIDTH_CLASS = {
  narrow: "max-w-4xl",
  wide: "max-w-6xl",
  full: "max-w-none",
};

const TONE_CLASS = {
  dark: {
    section: "bg-white text-white",
    panel: "bg-zinc-950 text-white",
    eyebrow: "text-zinc-300",
    muted: "text-zinc-300",
    chip: "bg-white/10 text-white",
    stat: "border-white/10 bg-white/[0.07]",
    secondary: "border-white/20 text-white hover:bg-white/10",
  },
  light: {
    section: "bg-white text-zinc-950",
    panel: "border border-zinc-200 bg-white text-zinc-950",
    eyebrow: "text-zinc-500",
    muted: "text-zinc-600",
    chip: "bg-zinc-100 text-zinc-700",
    stat: "border-zinc-200 bg-zinc-50",
    secondary: "border-zinc-200 text-zinc-800 hover:bg-zinc-50",
  },
  soft: {
    section: "bg-cyan-50 text-zinc-950",
    panel: "border border-cyan-100 bg-white text-zinc-950",
    eyebrow: "text-cyan-700",
    muted: "text-cyan-950/70",
    chip: "bg-cyan-100 text-cyan-800",
    stat: "border-cyan-100 bg-cyan-50",
    secondary: "border-cyan-200 text-cyan-950 hover:bg-cyan-50",
  },
  accent: {
    section: "bg-emerald-50 text-zinc-950",
    panel: "bg-emerald-950 text-white",
    eyebrow: "text-emerald-200",
    muted: "text-emerald-100/80",
    chip: "bg-white/10 text-white",
    stat: "border-white/10 bg-white/[0.08]",
    secondary: "border-white/20 text-white hover:bg-white/10",
  },
};

const BUTTON_CLASS = {
  solid:
    "border-transparent bg-white text-zinc-950 hover:bg-zinc-100 dark:bg-white dark:text-zinc-950",
  soft:
    "border-transparent bg-white/10 text-white hover:bg-white/15",
  outline: "border-white/25 bg-transparent text-white hover:bg-white/10",
};

export function AffiliateCtaBlock({ data }: { data: AffiliateCtaData }) {
  const tone = data.tone ?? "dark";
  const layout = data.layout ?? "card";
  const width = data.width ?? "wide";
  const compact = data.compact ?? false;
  const toneClass = TONE_CLASS[tone];
  const split = layout === "split";
  const stacked = layout === "stacked";
  const banner = layout === "banner";

  return (
    <section className={cn("px-6 py-16", toneClass.section)}>
      <div className={cn("mx-auto", WIDTH_CLASS[width], width === "full" && "px-0")}>
        <div
          className={cn(
            "overflow-hidden rounded-2xl px-6 py-10 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.85)] sm:px-10",
            compact ? "sm:py-9" : "sm:py-12",
            toneClass.panel,
            banner && "rounded-xl",
            split && "grid gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-center",
            stacked && "text-center"
          )}
        >
          <div className={cn(stacked && "mx-auto max-w-3xl")}>
            <p
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
                toneClass.chip
              )}
            >
              <Landmark className="h-3.5 w-3.5" aria-hidden="true" />
              {data.eyebrow || "Affiliate program"}
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              {data.heading}
            </h2>
            {data.description ? (
              <p className={cn("mt-3 max-w-2xl text-sm leading-6", toneClass.muted, stacked && "mx-auto")}>
                {data.description}
              </p>
            ) : null}

            {data.showStats ?? true ? (
              <div className={cn("mt-6 grid gap-3 sm:grid-cols-3", stacked && "mx-auto max-w-3xl")}>
                <AffiliateStat
                  icon={BadgePercent}
                  label="Commission"
                  value={data.commission}
                  toneClass={toneClass}
                />
                <AffiliateStat
                  icon={HandCoins}
                  label="Payout"
                  value={data.payoutLabel}
                  toneClass={toneClass}
                />
                <AffiliateStat
                  icon={Clock3}
                  label="Attribution"
                  value={data.cookieLabel}
                  toneClass={toneClass}
                />
              </div>
            ) : data.commission ? (
              <p className={cn("mt-5 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold", toneClass.chip)}>
                <BadgePercent className="h-4 w-4" aria-hidden="true" />
                {data.commission}
              </p>
            ) : null}

            {data.showBenefits ?? true ? (
              <div
                className={cn(
                  "mt-6 grid gap-2 text-sm",
                  stacked ? "mx-auto max-w-2xl sm:grid-cols-3" : "sm:grid-cols-3"
                )}
              >
                {(data.benefits ?? []).filter(Boolean).slice(0, 6).map((benefit, index) => (
                  <p
                    key={`${benefit}-${index}`}
                    className={cn(
                      "flex items-start gap-2 rounded-lg px-3 py-2 text-left",
                      toneClass.chip
                    )}
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{benefit}</span>
                  </p>
                ))}
              </div>
            ) : null}

            {data.proofText ? (
              <p className={cn("mt-5 inline-flex items-center gap-2 text-xs font-medium", toneClass.eyebrow)}>
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                {data.proofText}
              </p>
            ) : null}

            <div className={cn("mt-7 flex flex-wrap gap-3", stacked && "justify-center")}>
              {data.primaryLabel ? (
                <Link
                  href={data.primaryHref || "#"}
                  className={cn(
                    "inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition",
                    BUTTON_CLASS[data.buttonStyle ?? "solid"]
                  )}
                >
                  {data.primaryLabel}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              ) : null}
              {data.secondaryLabel ? (
                <Link
                  href={data.secondaryHref || "#"}
                  className={cn(
                    "inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-semibold transition",
                    toneClass.secondary
                  )}
                >
                  {data.secondaryLabel}
                </Link>
              ) : null}
            </div>
          </div>

          {split || data.showImage ? (
            <AffiliateVisual data={data} tone={tone} />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function AffiliateStat({
  icon: Icon,
  label,
  value,
  toneClass,
}: {
  icon: typeof BadgePercent;
  label: string;
  value: string;
  toneClass: (typeof TONE_CLASS)["dark"];
}) {
  return (
    <div className={cn("rounded-xl border p-4", toneClass.stat)}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      <p className={cn("mt-3 text-[11px] font-semibold uppercase tracking-wider", toneClass.eyebrow)}>
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function AffiliateVisual({
  data,
  tone,
}: {
  data: AffiliateCtaData;
  tone: NonNullable<AffiliateCtaData["tone"]>;
}) {
  const dark = tone === "dark" || tone === "accent";

  if (data.showImage && data.imageUrl) {
    return (
      <div className="overflow-hidden rounded-xl bg-white/10">
        <BlockImage
          sizes={"(min-width: 1024px) 50vw, 100vw"}
          src={data.imageUrl}
          alt=""
          className="aspect-[4/3] h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border p-5",
        dark ? "border-white/10 bg-white/[0.07]" : "border-zinc-200 bg-zinc-50"
      )}
    >
      <div className="grid gap-3">
        <div className={cn("rounded-xl p-4", dark ? "bg-white/10" : "bg-white")}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={cn("text-xs", dark ? "text-zinc-300" : "text-zinc-500")}>
                Referral revenue
              </p>
              <p className="mt-1 text-2xl font-semibold">{data.commission || "20%"}</p>
            </div>
            <TrendingUp className="h-8 w-8" aria-hidden="true" />
          </div>
        </div>
        <div className={cn("rounded-xl p-4", dark ? "bg-white/10" : "bg-white")}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white">
              <HandCoins className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold">{data.payoutLabel || "Monthly payouts"}</p>
              <p className={cn("text-xs", dark ? "text-zinc-300" : "text-zinc-500")}>
                Trackable affiliate performance
              </p>
            </div>
          </div>
        </div>
        <div className={cn("flex items-center justify-center rounded-xl p-8", dark ? "bg-white/10" : "bg-white")}>
          <ImageIcon className={cn("h-10 w-10", dark ? "text-white/40" : "text-zinc-300")} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
