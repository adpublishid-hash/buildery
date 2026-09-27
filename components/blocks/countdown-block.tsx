"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock3 } from "lucide-react";

import type { CountdownData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";

type Remaining = { days: number; hours: number; minutes: number; seconds: number };

function computeRemaining(targetMs: number): Remaining {
  const diff = Math.max(0, targetMs - Date.now());
  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

export function CountdownBlock({ data }: { data: CountdownData }) {
  const layout = data.layout ?? "cards";
  const tone = data.tone ?? "light";
  const centered = (data.align ?? "center") === "center";
  const inverse = tone === "dark" || tone === "accent";
  const showLabels = data.showLabels ?? true;
  const showSeconds = data.showSeconds ?? true;

  const targetMs = useMemo(() => {
    if (!data.targetDate) return 0;
    const ms = new Date(data.targetDate).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }, [data.targetDate]);

  // Start with zeroed time so SSR matches the first client paint (avoids hydration mismatch);
  // the ticker fills in the real remaining time on the next frame.
  const [remaining, setRemaining] = useState<Remaining>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!targetMs) {
      setMounted(true);
      return;
    }
    setRemaining(computeRemaining(targetMs));
    setMounted(true);
    const interval = window.setInterval(() => {
      setRemaining(computeRemaining(targetMs));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [targetMs]);

  const expired =
    mounted &&
    targetMs > 0 &&
    remaining.days === 0 &&
    remaining.hours === 0 &&
    remaining.minutes === 0 &&
    remaining.seconds === 0;

  const units: { value: number; label: string; key: string }[] = [
    { value: remaining.days, label: data.labelDays, key: "d" },
    { value: remaining.hours, label: data.labelHours, key: "h" },
    { value: remaining.minutes, label: data.labelMinutes, key: "m" },
  ];
  if (showSeconds) units.push({ value: remaining.seconds, label: data.labelSeconds, key: "s" });

  const sectionTone =
    tone === "dark"
      ? "bg-zinc-950 text-white"
      : tone === "accent"
        ? "bg-[var(--bd-accent,#18181b)] text-white"
        : tone === "soft"
          ? "bg-zinc-50"
          : "";

  return (
    <section className={cn("relative overflow-hidden px-4 py-16 sm:px-6 md:px-10 md:py-24", sectionTone)}>
      {inverse ? (
        <>
          <div className="pointer-events-none absolute -left-24 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-white/[0.04] blur-3xl" />
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[var(--bd-accent,#f97316)] opacity-15 blur-3xl" />
        </>
      ) : null}
      <div
        className={cn(
          "relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] border px-5 py-10 sm:px-8 md:px-12 md:py-14",
          centered && "text-center",
          inverse
            ? "border-white/10 bg-white/[0.045] shadow-2xl shadow-black/20"
            : "border-zinc-200 bg-white shadow-xl shadow-zinc-900/5"
        )}
      >
        {data.eyebrow ? (
          <p
            className={cn(
              "mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]",
              inverse
                ? "border-white/10 bg-white/5 text-zinc-200"
                : "border-zinc-200 bg-zinc-50 text-zinc-600"
            )}
          >
            <Clock3 className="h-3.5 w-3.5" />
            {data.eyebrow}
          </p>
        ) : null}
        {data.heading ? (
          <h2
            className={cn(
              "text-3xl font-semibold leading-tight tracking-tight md:text-5xl",
              inverse ? "text-white" : "text-zinc-950"
            )}
          >
            {data.heading}
          </h2>
        ) : null}
        {data.subheading ? (
          <p
            className={cn(
              "mx-auto mt-4 max-w-2xl text-sm leading-relaxed md:text-base",
              inverse ? "text-zinc-200" : "text-zinc-500"
            )}
          >
            {data.subheading}
          </p>
        ) : null}

        {expired ? (
          <p
            className={cn(
              "mt-8 text-lg font-medium",
              inverse ? "text-white" : "text-zinc-700"
            )}
          >
            {data.expiredMessage}
          </p>
        ) : (
          <div
            className={cn(
              layout === "cards"
                ? "mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 md:gap-4"
                : "mt-10 flex flex-wrap gap-3",
              centered && layout !== "cards" && "justify-center",
              layout === "compact" && "items-baseline gap-2",
              layout === "minimal" && "gap-6"
            )}
          >
            {units.map((unit, index) => (
              <div key={unit.key} className="flex min-w-0 items-center gap-2">
                <div
                  className={cn(
                    "flex flex-col items-center",
                    layout === "cards" &&
                      "w-full min-w-0 rounded-2xl border px-3 py-4 sm:px-5 sm:py-5",
                    layout === "cards" &&
                      (inverse
                        ? "border-white/10 bg-black/20 shadow-inner shadow-white/5"
                        : tone === "soft"
                          ? "border-zinc-200 bg-white"
                          : "border-zinc-200 bg-zinc-50"),
                    layout === "compact" && "min-w-[44px]",
                    layout === "minimal" && "min-w-[56px]"
                  )}
                >
                  <span
                    className={cn(
                      "tabular-nums font-semibold",
                      layout === "cards" && "text-4xl tracking-tight sm:text-5xl",
                      layout === "compact" && "text-xl",
                      layout === "minimal" && "text-3xl md:text-5xl",
                      inverse ? "text-white" : "text-zinc-950"
                    )}
                  >
                    {layout === "compact"
                      ? `${unit.value}${unit.label.charAt(0).toLowerCase()}`
                      : pad(unit.value)}
                  </span>
                  {showLabels && layout !== "compact" ? (
                    <span
                      className={cn(
                        "mt-2 text-[10px] font-semibold uppercase tracking-[0.18em]",
                        inverse ? "text-zinc-300" : "text-zinc-500"
                      )}
                    >
                      {unit.label}
                    </span>
                  ) : null}
                </div>
                {layout === "minimal" && index < units.length - 1 ? (
                  <span
                    className={cn(
                      "text-2xl font-light",
                      inverse ? "text-white/40" : "text-zinc-300"
                    )}
                  >
                    :
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {data.ctaLabel ? (
          <Link
            href={data.ctaHref || "#"}
            className={cn(
              "mt-9 inline-flex h-12 items-center gap-2 rounded-full px-6 text-sm font-semibold shadow-lg transition hover:-translate-y-0.5 hover:opacity-95",
              inverse ? "bg-white text-zinc-950" : "text-white"
            )}
            style={
              inverse
                ? undefined
                : { backgroundColor: "var(--bd-accent, #18181b)" }
            }
          >
            {data.ctaLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null}
        <p className={cn("mt-4 text-xs", inverse ? "text-zinc-400" : "text-zinc-500")}>
          Waktu diperbarui otomatis sesuai batas penawaran.
        </p>
      </div>
    </section>
  );
}
