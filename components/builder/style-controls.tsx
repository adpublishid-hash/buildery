"use client";

import { useState } from "react";
import { ChevronDown, Link2, Link2Off } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Building blocks of the Style tab. They are deliberately dumb: every value
 * comes in as a prop and every change goes out through a callback, so the
 * StyleForm in settings-panel decides which device level a change lands on.
 */

/** A collapsible group of style fields. */
export function StyleSection({
  title,
  description,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  /** Short marker next to the title, e.g. that the section is customised. */
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-50">
            {title}
            {badge}
          </span>
          {description && !open ? (
            <span className="mt-0.5 block truncate text-[11px] text-zinc-500 dark:text-zinc-400">
              {description}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-zinc-400 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open ? (
        <div className="space-y-3 border-t border-zinc-100 px-3 pb-3 pt-3 dark:border-zinc-800/80">
          {children}
        </div>
      ) : null}
    </section>
  );
}

/** A dot marking a section that differs from the defaults. */
export function ChangedDot({ label = "Sudah diubah" }: { label?: string }) {
  return (
    <span
      aria-label={label}
      title={label}
      className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500"
    />
  );
}

/** A compact button group for a handful of options. */
export function SegmentedField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: React.ReactNode; title?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-900"
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              title={option.title}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex h-7 min-w-0 flex-1 items-center justify-center rounded-md px-1.5 text-[11px] font-medium transition",
                active
                  ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SideInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col items-center gap-1">
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isFinite(next)) return;
          onChange(Math.round(Math.min(max, Math.max(min, next))));
        }}
        className="h-8 w-full rounded-md border border-zinc-200 bg-white px-1.5 text-center text-xs text-zinc-900 shadow-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
        aria-label={label}
      />
      <span className="text-[10px] uppercase tracking-wide text-zinc-400">
        {label}
      </span>
    </label>
  );
}

export type SideKey = "top" | "right" | "bottom" | "left";

/**
 * Padding or margin with a link toggle. Linked, one slider per axis;
 * unlinked, one number per side. The initial mode follows the data: a block
 * whose sides already differ opens unlinked.
 */
export function BoxSpacingField({
  label,
  sides,
  values,
  min,
  max,
  initiallyLinked,
  renderLinked,
  onSideChange,
  onLinkChange,
}: {
  label: string;
  sides: SideKey[];
  values: Partial<Record<SideKey, number>>;
  min: number;
  max: number;
  initiallyLinked: boolean;
  /** The axis sliders shown while linked. */
  renderLinked: React.ReactNode;
  onSideChange: (side: SideKey, value: number) => void;
  /** Called when the user links the sides again, to drop per-side values. */
  onLinkChange?: (linked: boolean) => void;
}) {
  const [linked, setLinked] = useState(initiallyLinked);
  const LinkIcon = linked ? Link2 : Link2Off;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
          {label}
        </span>
        <button
          type="button"
          onClick={() => {
            setLinked(!linked);
            onLinkChange?.(!linked);
          }}
          aria-pressed={!linked}
          title={linked ? "Atur per sisi" : "Samakan per sumbu"}
          className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
        >
          <LinkIcon className="h-3 w-3" />
          {linked ? "Per sumbu" : "Per sisi"}
        </button>
      </div>
      {linked ? (
        renderLinked
      ) : (
        <div
          className={cn(
            "grid gap-2 rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950",
            sides.length === 4 ? "grid-cols-4" : "grid-cols-2"
          )}
        >
          {sides.map((side) => (
            <SideInput
              key={side}
              label={SIDE_LABELS[side]}
              value={values[side] ?? 0}
              min={min}
              max={max}
              onChange={(value) => onSideChange(side, value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const SIDE_LABELS: Record<SideKey, string> = {
  top: "Atas",
  right: "Kanan",
  bottom: "Bawah",
  left: "Kiri",
};

/** Quick picks next to a slider, e.g. common content widths. */
export function QuickPicks({
  value,
  options,
  onPick,
}: {
  value: number;
  options: { value: number; label: string }[];
  onPick: (value: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onPick(option.value)}
          className={cn(
            "h-6 rounded-md border px-2 text-[11px] transition",
            option.value === value
              ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
              : "border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
