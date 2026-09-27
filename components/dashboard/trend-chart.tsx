"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { Panel } from "./panel";

export type TrendMetric = "pageViews" | "visitors" | "orders" | "revenue";

export type TrendPoint = {
  /** Axis label, e.g. "26 Sep". */
  label: string;
  values: Record<TrendMetric, number>;
};

export type TrendSummary = Record<
  TrendMetric,
  { total: number; change: number | null }
>;

const METRICS: { key: TrendMetric; label: string }[] = [
  { key: "visitors", label: "Pengunjung" },
  { key: "pageViews", label: "Page view" },
  { key: "orders", label: "Pesanan" },
  { key: "revenue", label: "Pendapatan" },
];

const CHART_H = 184;

function format(metric: TrendMetric, value: number, compact = false) {
  if (metric === "revenue") {
    if (compact && value >= 1000) {
      return `Rp ${new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
    }
    return `Rp ${value.toLocaleString("id-ID")}`;
  }
  if (compact && value >= 10000) {
    return new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  }
  return value.toLocaleString("id-ID");
}

/**
 * A round axis ceiling split into four equal steps, so the ticks read
 * 0 / 200 / 400 / 600 / 800 rather than 0 / 37 / 74.
 */
function niceMax(value: number) {
  const raw = Math.max(value, 4) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((m) => m >= raw) ?? 10 * pow;
  return step * 4;
}

/**
 * The "Performance Trend" panel (Kravio): the period total with its change,
 * then one bar per day. The last day is highlighted; hovering or arrow keys
 * move the highlight, and a dashed rule and a dark tag read out its value.
 */
export function TrendChart({
  points,
  summary,
  compareLabel,
  className,
}: {
  points: TrendPoint[];
  summary: TrendSummary;
  compareLabel: string;
  className?: string;
}) {
  const [metric, setMetric] = useState<TrendMetric>("visitors");
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const last = points.length - 1;
  const active = hover ?? pinned ?? last;

  useEffect(() => setPinned(null), [points.length]);

  const values = points.map((p) => p.values[metric]);
  // Nothing to point at: the tag would only read "0" over the empty message.
  const empty = values.every((v) => v === 0);
  const max = niceMax(Math.max(0, ...values));
  const ticks = [max, (max * 3) / 4, max / 2, max / 4, 0];
  const slot = 100 / Math.max(points.length, 1);
  const barW = slot * (points.length > 20 ? 0.74 : 0.6);
  const heightOf = (v: number) => (v <= 0 ? 2 : Math.max(4, (v / max) * CHART_H));

  // Label every day when they fit, otherwise about six evenly spaced ones.
  const labelEvery = useMemo(
    () => (points.length <= 10 ? 1 : Math.ceil(points.length / 6)),
    [points.length]
  );

  const current = summary[metric];
  const metricLabel = METRICS.find((m) => m.key === metric)!.label;
  const activePoint = points[active];
  const activeValue = activePoint ? activePoint.values[metric] : 0;
  const barTop = CHART_H - heightOf(activeValue);
  const barLeft = active * slot + (slot - barW) / 2;
  const tagOnRight = barLeft + barW < 78;

  return (
    <Panel
      title="Tren Performa"
      icon={BarChart3}
      iconPosition="left"
      className={cn("h-[344px] animate-kv-rise [animation-delay:260ms]", className)}
      bodyClassName="justify-between gap-[8px] p-[12px]"
      action={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" className="group/ps w-[124px] justify-between pl-[10px] pr-[8px]">
              <span key={metric} className="animate-kv-fade">
                {metricLabel}
              </span>
              <ChevronDown className="!h-[12px] !w-[12px] transition-transform duration-200 group-data-[state=open]/ps:rotate-180" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Metrik</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={metric} onValueChange={(v) => setMetric(v as TrendMetric)}>
              {METRICS.map((m) => (
                <DropdownMenuRadioItem key={m.key} value={m.key}>
                  {m.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <div className="flex items-end gap-[10px] whitespace-nowrap leading-none">
        <p key={metric} className="kv-tabular animate-kv-fade text-[26px] font-semibold tracking-[-0.01em] text-kv-fg">
          {format(metric, current.total)}
        </p>
        <p className="flex min-w-0 items-center gap-[6px] pb-[2px]">
          {current.change !== null ? (
            <span
              className={cn(
                "text-[12px] font-medium",
                current.change >= 0 ? "text-kv-success" : "text-kv-destructive"
              )}
            >
              {current.change >= 0 ? "+" : ""}
              {current.change.toFixed(1)}%
            </span>
          ) : null}
          <span className="truncate text-[13px] tracking-[-0.13px] text-kv-muted-fg">{compareLabel}</span>
        </p>
      </div>

      <div className="flex w-full items-center gap-[10px]">
        <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
          <div
            role="group"
            tabIndex={0}
            aria-label={`${metricLabel} per hari. Gunakan panah kiri dan kanan untuk melihat tiap batang.`}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const next = Math.min(last, Math.max(0, active + (e.key === "ArrowRight" ? 1 : -1)));
              setPinned(next);
              setHover(null);
            }}
            onMouseLeave={() => setHover(null)}
            className="relative w-full overflow-clip rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-kv-ring/40"
            style={{ height: CHART_H }}
          >
            {/* grid */}
            {ticks.map((_, i) => (
              <span
                key={i}
                aria-hidden
                className="pointer-events-none absolute inset-x-0 h-px bg-[#f2f2f3]"
                style={{ top: i === ticks.length - 1 ? CHART_H - 1 : (CHART_H / (ticks.length - 1)) * i }}
              />
            ))}

            {points.map((point, i) => {
              const on = i === active;
              return (
                <div
                  key={`${point.label}-${i}`}
                  className="absolute bottom-0 transition-[height] duration-700 ease-out-expo"
                  style={{
                    left: `${i * slot + (slot - barW) / 2}%`,
                    width: `${barW}%`,
                    height: heightOf(point.values[metric]),
                  }}
                >
                  <div
                    className="relative h-full w-full animate-kv-grow"
                    style={{ animationDelay: `${380 + i * Math.min(45, 900 / points.length)}ms` }}
                  >
                    <div
                      className={cn(
                        "absolute inset-0 rounded-b-[4px] rounded-t-[8px] bg-gradient-to-b from-[#e6e6e6] to-[rgba(230,230,230,0.6)] shadow-[inset_0_0_0_0.444px_#d8d8d8,inset_0px_0px_0px_1px_white] transition-opacity duration-300",
                        on ? "opacity-0" : "opacity-100"
                      )}
                    />
                    <div
                      className={cn(
                        "kv-gradient absolute inset-0 origin-bottom rounded-b-[4px] rounded-t-[8px] shadow-[inset_0_0_0_0.44px_#1f2937,0px_2px_10px_0px_rgba(31,41,55,0.08)] transition-[opacity,transform] duration-300",
                        on ? "opacity-100" : "scale-y-[0.98] opacity-0"
                      )}
                    />
                  </div>
                </div>
              );
            })}

            {activePoint && !empty ? (
              <div aria-hidden className="pointer-events-none absolute inset-0 animate-kv-fade [animation-delay:1100ms]">
                <div
                  className="absolute h-0 border-t border-dashed border-[#9ca3af] transition-[left,top,width] duration-500 ease-out-expo"
                  style={
                    tagOnRight
                      ? { left: `calc(${barLeft + barW}% + 3px)`, right: 0, top: barTop - 0.5 }
                      : { left: 0, width: `calc(${barLeft}% - 3px)`, top: barTop - 0.5 }
                  }
                />
                <span
                  className="absolute block h-[4px] w-[4px] rounded-full bg-kv-fg transition-[left,top] duration-500 ease-out-expo"
                  style={{
                    left: tagOnRight ? `calc(${barLeft + barW}% + 1px)` : `calc(${barLeft}% - 5px)`,
                    top: barTop - 2.5,
                  }}
                />
                <div
                  className="absolute flex h-[24px] items-center transition-[left,top] duration-500 ease-out-expo"
                  style={{
                    // Near the floor the tag would hang below the chart; keep it inside.
                    top: Math.min(barTop - 12, CHART_H - 26),
                    ...(tagOnRight
                      ? { left: `calc(${barLeft + barW}% + 8px)` }
                      : { right: `calc(${100 - barLeft}% + 8px)` }),
                  }}
                >
                  <span
                    className={cn(
                      "absolute top-1/2 h-[8px] w-[8px] -translate-y-1/2 rotate-45 rounded-[1px] bg-kv-fg",
                      tagOnRight ? "-left-[3px]" : "-right-[3px]"
                    )}
                  />
                  <p
                    key={`${active}-${metric}`}
                    className="kv-tabular relative animate-kv-fade whitespace-nowrap rounded-[6px] bg-kv-fg px-[8px] py-[6px] text-[12px] font-medium leading-none text-white"
                  >
                    {activePoint.label} : {format(metric, activeValue, true)}
                  </p>
                </div>
              </div>
            ) : null}

            {points.map((point, i) => (
              <button
                key={`hit-${i}`}
                type="button"
                tabIndex={-1}
                aria-label={`${point.label}: ${format(metric, point.values[metric])}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onClick={() => setPinned(i)}
                className="absolute bottom-0 top-0 cursor-crosshair"
                style={{ left: `${i * slot}%`, width: `${slot}%` }}
              />
            ))}

            {empty ? (
              <div className="pointer-events-none absolute inset-x-0 top-[38%] flex animate-kv-fade flex-col items-center gap-[4px] text-center">
                <p className="text-[13px] font-medium text-kv-secondary-fg">Belum ada data di periode ini</p>
                <p className="text-[12px] text-kv-muted-fg">Grafik terisi setelah halaman publik menerima traffic.</p>
              </div>
            ) : null}
            <p className="sr-only" aria-live="polite">
              {activePoint ? `${activePoint.label}: ${format(metric, activeValue)}` : ""}
            </p>
          </div>

          <div className="relative h-[13px] w-full" aria-hidden>
            {points.map((point, i) =>
              i % labelEvery === 0 || i === last ? (
                <p
                  key={`${point.label}-${i}`}
                  className={cn(
                    "absolute top-0 -translate-x-1/2 whitespace-nowrap text-[13px] leading-none tracking-[-0.13px] transition-colors duration-300",
                    (hover ?? pinned) !== null && i === active ? "text-kv-fg" : "text-kv-muted-fg",
                    // Keep the final label clear of its neighbour.
                    i !== last && last - i < labelEvery / 2 && "hidden"
                  )}
                  style={{ left: `${(i + 0.5) * slot}%` }}
                >
                  {point.label}
                </p>
              ) : null
            )}
          </div>
        </div>

        <div
          className="flex shrink-0 flex-col items-end justify-between self-start"
          style={{ height: CHART_H + 4, marginTop: -2 }}
          aria-hidden
        >
          {ticks.map((tick, i) => (
            <p key={i} className="kv-tabular whitespace-nowrap text-[13px] leading-none tracking-[-0.13px] text-kv-muted-fg">
              {format(metric, Math.round(tick), true)}
            </p>
          ))}
        </div>
      </div>
    </Panel>
  );
}
