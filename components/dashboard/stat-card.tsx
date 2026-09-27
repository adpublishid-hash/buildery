import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { Sparkline } from "./sparkline";

type Props = {
  label: string;
  value: string | number;
  /** "+12.3% vs periode sebelumnya", or any short note under the value. */
  delta?: string;
  trend?: "up" | "down" | "neutral";
  icon?: LucideIcon;
  /** Optional series drawn as a sparkline on the right of the card. */
  spark?: number[];
  className?: string;
  /** Position in a row, used to stagger the entrance animation. */
  index?: number;
};

// A leading "+12,3%" / "−4%" is split off so it can carry the trend colour.
const LEADING_CHANGE = /^([+−-]\s?[\d.,]+%)\s*(.*)$/;

/**
 * KPI card (Kravio): the label and icon on the hatched frame, the number, its
 * change and an optional sparkline on the white card inside.
 */
export function StatCard({
  label,
  value,
  delta,
  trend = "neutral",
  icon: Icon,
  spark,
  className,
  index = 0,
}: Props) {
  const match = delta ? LEADING_CHANGE.exec(delta) : null;
  const tone =
    trend === "up" ? "text-kv-success" : trend === "down" ? "text-kv-destructive" : "text-kv-muted-fg";

  return (
    <section
      aria-label={label}
      style={{ animationDelay: `${80 + index * 70}ms` }}
      className={cn(
        "kv-frame group/kpi flex min-h-[116px] min-w-0 animate-kv-rise flex-col items-start p-[4px]",
        className
      )}
    >
      <div className="relative flex w-full shrink-0 items-center justify-between gap-[8px] px-[8px] py-[6px]">
        <h2 className="truncate whitespace-nowrap text-[13px] font-medium leading-none text-kv-secondary-fg">
          {label}
        </h2>
        {Icon && (
          <Icon
            className="h-[16px] w-[16px] shrink-0 text-kv-secondary-fg transition-transform duration-300 ease-out-expo group-hover/kpi:-rotate-12 group-hover/kpi:scale-110"
            strokeWidth={1.6}
          />
        )}
      </div>
      <div className="relative flex min-h-px w-full flex-1 items-end justify-between gap-[8px] rounded-[10px] border-[0.8px] border-kv-border bg-kv-card px-[12px] py-[10px] transition-[box-shadow,transform] duration-300 ease-out-expo group-hover/kpi:-translate-y-px group-hover/kpi:shadow-kv-hover">
        <div className="flex min-w-0 flex-col items-start gap-[8px] leading-none">
          <p className="kv-tabular max-w-full truncate whitespace-nowrap text-[22px] font-semibold tracking-[-0.01em] text-kv-fg">
            {value}
          </p>
          {delta ? (
            match ? (
              <p className="flex min-w-0 max-w-full items-center gap-[6px] whitespace-nowrap">
                <span className={cn("text-[12px] font-medium", tone)}>{match[1]}</span>
                <span className="truncate text-[13px] text-kv-muted-fg">{match[2]}</span>
              </p>
            ) : (
              <p className="max-w-full truncate text-[13px] text-kv-muted-fg" title={delta}>
                {delta}
              </p>
            )
          ) : null}
        </div>
        {spark && spark.length > 1 && spark.some((v) => v > 0) ? (
          <div className="flex shrink-0 items-end transition-transform duration-300 [transform-origin:bottom_right] group-hover/kpi:scale-[1.04]">
            <Sparkline data={spark} trend={trend} height={30} width={84} delay={300 + index * 120} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
