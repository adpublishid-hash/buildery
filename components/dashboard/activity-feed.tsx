"use client";

import Link from "next/link";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  GraduationCap,
  Newspaper,
  Search,
  ShoppingBag,
  UserCog,
  Wallet,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { Panel } from "./panel";

export type ActivityKind = "order" | "paid" | "form" | "enrollment" | "team";

export type Activity = {
  id: string;
  kind: ActivityKind;
  title: string;
  /** Plain text runs, with `{ strong }` runs rendered in the darker ink. */
  body: Array<string | { strong: string }>;
  /** Pre-formatted on the server, so SSR and the browser agree. */
  time: string;
  /** Whole days before today, in the server's time zone (0 = today). */
  daysAgo: number;
  href?: string;
};

const ICONS: Record<ActivityKind, LucideIcon> = {
  order: ShoppingBag,
  paid: Wallet,
  form: ClipboardList,
  enrollment: GraduationCap,
  team: UserCog,
};

type Range = "today" | "yesterday" | "week";
const RANGES: { value: Range; label: string; caption: string }[] = [
  { value: "today", label: "Hari ini", caption: "aktivitas hari ini" },
  { value: "yesterday", label: "Kemarin", caption: "aktivitas kemarin" },
  { value: "week", label: "Minggu ini", caption: "aktivitas 7 hari terakhir" },
];

const plain = (body: Activity["body"]) =>
  body.map((run) => (typeof run === "string" ? run : run.strong)).join("");

function Highlight({ value, query }: { value: string; query: string }) {
  if (!query) return <>{value}</>;
  const at = value.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return <>{value}</>;
  return (
    <>
      {value.slice(0, at)}
      <mark className="rounded-[2px] bg-[#fef3c7] text-inherit">
        {value.slice(at, at + query.length)}
      </mark>
      {value.slice(at + query.length)}
    </>
  );
}

/** Kravio's "Latest Updates": what happened in the workspace, newest first. */
export function ActivityFeed({
  activities,
  className,
}: {
  activities: Activity[];
  className?: string;
}) {
  const [range, setRange] = useState<Range>("today");
  const [query, setQuery] = useState("");
  const index = RANGES.findIndex((r) => r.value === range);
  const q = query.trim();

  const shown = activities.filter((a) => {
    if (range === "today" && a.daysAgo !== 0) return false;
    if (range === "yesterday" && a.daysAgo !== 1) return false;
    return !q || `${a.title} ${plain(a.body)}`.toLowerCase().includes(q.toLowerCase());
  });

  return (
    <Panel
      title="Aktivitas Terbaru"
      icon={Newspaper}
      className={cn("h-[472px] animate-kv-rise [animation-delay:200ms]", className)}
      bodyClassName="items-start gap-[10px] p-[12px]"
    >
      <div className="flex w-full flex-col gap-[8px]">
        <div role="radiogroup" aria-label="Rentang aktivitas" className="relative flex w-full items-start gap-[8px]">
          <span
            aria-hidden
            className="kv-gradient absolute top-0 h-[28px] rounded-[8px] border border-kv-fg transition-[left] duration-300 ease-out-expo"
            style={{
              width: "calc((100% - 16px) / 3)",
              left: `calc(((100% - 16px) / 3 + 8px) * ${index})`,
            }}
          />
          {RANGES.map((r) => {
            const on = r.value === range;
            return (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setRange(r.value)}
                className={cn(
                  "relative z-10 flex h-[28px] min-w-0 flex-1 items-center justify-center rounded-[8px] border-[0.8px] px-[8px] text-[12px] font-medium leading-none outline-none transition-[color,background-color,border-color,transform] duration-200 active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-kv-ring/40",
                  on
                    ? "border-transparent bg-transparent text-white"
                    : "border-kv-border bg-kv-card text-kv-secondary-fg hover:bg-kv-hover"
                )}
              >
                <span className="truncate">{r.label}</span>
              </button>
            );
          })}
        </div>

        <label className="flex h-[32px] w-full cursor-text items-center gap-[8px] overflow-clip rounded-[8px] border-[0.8px] border-kv-border bg-kv-card py-[8px] pl-[10px] pr-[8px] transition-[border-color,box-shadow] duration-150 focus-within:border-[#9ca3af] focus-within:shadow-[0_0_0_3px_rgba(156,163,175,0.18)] hover:border-[#d1d5db]">
          <Search className="h-[16px] w-[16px] shrink-0 text-kv-secondary-fg" strokeWidth={1.6} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari aktivitas"
            aria-label="Cari aktivitas"
            className="min-w-0 flex-1 bg-transparent text-[13px] leading-none text-kv-fg outline-none placeholder:text-kv-muted-fg [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="animate-kv-fade text-[12px] leading-none text-kv-subtle hover:text-kv-fg"
            >
              Hapus
            </button>
          ) : null}
        </label>
      </div>

      <div className="flex w-full flex-col gap-[10px]">
        <p className="whitespace-nowrap text-[13px] leading-none tracking-[-0.16px] text-kv-muted-fg">
          <span className="kv-tabular text-[15px] font-semibold text-kv-fg">{shown.length}</span>{" "}
          {q ? `hasil untuk “${q}”` : RANGES[index].caption}
        </p>
        <div className="kv-dash-x w-full" />
      </div>

      <ol key={range} className="kv-no-scrollbar flex min-h-0 w-full flex-1 flex-col gap-[14px] overflow-y-auto">
        {shown.map((a, i) => {
          const Icon = ICONS[a.kind];
          const content = (
            <>
              <span className="relative z-10 flex items-center rounded-[8px] border-[0.8px] border-kv-input bg-kv-card p-[7px] text-kv-secondary-fg transition-[transform,box-shadow] duration-200 ease-out-expo group-hover/item:-translate-y-px group-hover/item:shadow-kv-hover">
                <Icon className="h-[15px] w-[15px] transition-transform duration-300 group-hover/item:scale-110" strokeWidth={1.6} />
              </span>
              {i < shown.length - 1 ? (
                <span aria-hidden className="kv-dash-y absolute bottom-[-14px] left-[14.5px] top-[30px] w-px" />
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-[6px] pt-[2px] text-[12px] tracking-[-0.12px]">
                <div className="flex w-full items-center justify-between gap-[8px] leading-none">
                  <p className="truncate font-medium text-kv-fg">
                    <Highlight value={a.title} query={q} />
                  </p>
                  <time className="shrink-0 whitespace-nowrap text-kv-subtle">{a.time}</time>
                </div>
                <p className="leading-[1.4] text-kv-subtle">
                  {a.body.map((run, j) =>
                    typeof run === "string" ? (
                      <Highlight key={j} value={run} query={q} />
                    ) : (
                      <span key={j} className="text-kv-fg">
                        <Highlight value={run.strong} query={q} />
                      </span>
                    )
                  )}
                </p>
              </div>
            </>
          );
          return (
            <li
              key={a.id}
              className="relative flex w-full animate-kv-rise"
              style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}
            >
              {a.href ? (
                <Link href={a.href} className="group/item relative flex w-full items-start gap-[10px] rounded-[8px] outline-none focus-visible:ring-[3px] focus-visible:ring-kv-ring/40">
                  {content}
                </Link>
              ) : (
                <div className="group/item relative flex w-full items-start gap-[10px]">{content}</div>
              )}
            </li>
          );
        })}
        {shown.length === 0 ? (
          <li className="flex w-full animate-kv-fade flex-col items-center gap-[6px] py-[40px] text-center">
            <Search className="h-[16px] w-[16px] text-kv-secondary-fg opacity-50" />
            <p className="text-[13px] font-medium text-kv-fg">Belum ada aktivitas</p>
            <p className="text-[12px] text-kv-muted-fg">
              {q ? "Coba nomor order, nama pelanggan, atau nama form." : "Order, form, dan aktivitas tim akan muncul di sini."}
            </p>
          </li>
        ) : null}
      </ol>
    </Panel>
  );
}
