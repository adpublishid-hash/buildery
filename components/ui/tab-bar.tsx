"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type TabItem = {
  key: string;
  label: string;
  icon?: LucideIcon;
  /** Set for tabs that navigate; omit for tabs handled in the page. */
  href?: string;
  danger?: boolean;
  /** Small counter shown after the label, e.g. items waiting for review. Hidden at 0. */
  count?: number;
};

/**
 * One row of tabs, scrollable on narrow screens.
 *
 * Settings and integrations used to be one long scroll: everything rendered at
 * once and finding a field meant hunting down the page. Tabs show one group at
 * a time, and the settings page only queries the data that group needs.
 */
export function TabBar({
  items,
  active,
  onSelect,
  className,
  ariaLabel,
}: {
  items: TabItem[];
  active: string;
  onSelect?: (key: string) => void;
  className?: string;
  ariaLabel: string;
}) {
  const row = useRef<HTMLDivElement>(null);

  // On a phone the row scrolls, and the active tab is often past the edge —
  // on the integrations page it was half cut off on load. Bring it into view.
  useEffect(() => {
    const el = row.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <div
      ref={row}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "flex gap-[8px] overflow-x-auto",
        // Keep the scrollbar out of the way; the tabs are short.
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {items.map((item) => {
        const isActive = item.key === active;
        const Icon = item.icon;
        const content = (
          <>
            {Icon ? (
              <Icon
                className={cn(
                  "h-[14px] w-[14px] shrink-0",
                  isActive ? "text-current" : "text-kv-muted-fg group-hover:text-current"
                )}
              />
            ) : null}
            <span className="whitespace-nowrap">{item.label}</span>
            {item.count ? (
              <span
                className={cn(
                  "kv-tabular -mr-[3px] inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full px-[5px] text-[10px] font-semibold leading-none",
                  isActive ? "bg-white/20 text-white" : "bg-kv-secondary text-kv-secondary-fg"
                )}
              >
                {item.count > 99 ? "99+" : item.count}
              </span>
            ) : null}
          </>
        );
        const classes = cn(
          "group flex h-[28px] shrink-0 items-center gap-[6px] rounded-[8px] border-[0.8px] px-[10px] text-[12px] font-medium leading-none outline-none transition-[color,background-color,border-color,transform] duration-200 active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-kv-ring/40",
          isActive
            ? "kv-gradient border-kv-fg text-white"
            : item.danger
              ? "border-kv-border bg-kv-card text-kv-muted-fg hover:bg-kv-hover hover:text-kv-fg"
              : "border-kv-border bg-kv-card text-kv-secondary-fg hover:bg-kv-hover hover:text-kv-fg"
        );

        if (item.href) {
          return (
            <Link
              key={item.key}
              href={item.href}
              role="tab"
              aria-selected={isActive}
              // The tab bar sits at the top; jumping to it on every switch is noise.
              scroll={false}
              className={classes}
            >
              {content}
            </Link>
          );
        }

        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect?.(item.key)}
            className={classes}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
