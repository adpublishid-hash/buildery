"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, GraduationCap, ShoppingBag, Sparkles, X } from "lucide-react";

import {
  DEFAULT_SALES_NOTIFICATION_TEXT,
  type SalesNotificationItem,
} from "@/lib/sales-notification-shared";
import { cn } from "@/lib/utils";

type Props = {
  items: SalesNotificationItem[];
  template?: string | null;
};

const DISPLAY_MS = 5800;
const GAP_MS = 1600;
const FIRST_DELAY_MS = 2200;

export function SalesNotification({ items, template }: Props) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const active = items[index % Math.max(items.length, 1)];
  const message = useMemo(
    () => (active ? renderTemplate(template, active) : ""),
    [active, template]
  );

  useEffect(() => {
    if (items.length === 0 || dismissed) return;

    let hideTimer: number | null = null;
    let nextTimer: number | null = null;
    const showTimer = window.setTimeout(() => {
      setVisible(true);
      hideTimer = window.setTimeout(() => {
        setVisible(false);
        nextTimer = window.setTimeout(() => {
          setIndex((current) => (current + 1) % items.length);
        }, GAP_MS);
      }, DISPLAY_MS);
    }, FIRST_DELAY_MS);

    return () => {
      window.clearTimeout(showTimer);
      if (hideTimer) window.clearTimeout(hideTimer);
      if (nextTimer) window.clearTimeout(nextTimer);
    };
  }, [dismissed, index, items.length]);

  if (!active || dismissed) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] left-4 z-40 w-[calc(100vw-2rem)] max-w-sm transition-all duration-300 sm:bottom-5 sm:left-5 sm:w-96",
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-4 opacity-0"
      )}
      aria-live="polite"
    >
      <div className="pointer-events-auto overflow-hidden rounded-2xl border border-zinc-200 bg-white/95 shadow-2xl shadow-zinc-900/10 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="flex items-start gap-3 p-3">
          <a
            href={active.href}
            className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800"
            aria-label={`Buka ${active.item}`}
          >
            {active.imageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={active.imageUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            ) : (
              <NotificationIcon type={active.type} />
            )}
          </a>
          <a href={active.href} className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-100">
                <Sparkles className="h-3 w-3" />
                {active.typeLabel}
              </span>
              <span className="text-[11px] text-zinc-400">
                {relativeTime(active.createdAt)}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm font-medium leading-5 text-zinc-900 dark:text-zinc-50">
              {message}
            </p>
          </a>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
            aria-label="Tutup sales notification"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function NotificationIcon({ type }: { type: SalesNotificationItem["type"] }) {
  if (type === "course") return <GraduationCap className="h-5 w-5" />;
  if (type === "membership") return <BellRing className="h-5 w-5" />;
  return <ShoppingBag className="h-5 w-5" />;
}

function renderTemplate(
  template: string | null | undefined,
  item: SalesNotificationItem
) {
  const source = template?.trim() || DEFAULT_SALES_NOTIFICATION_TEXT;
  const values = {
    name: item.name,
    action: item.action,
    item: item.item,
    type: item.typeLabel,
    time: relativeTime(item.createdAt),
  };

  return source.replace(
    /\{(name|action|item|type|time)\}/g,
    (_, key: string) => values[key as keyof typeof values] ?? ""
  );
}

function relativeTime(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "baru saja";

  const diff = Math.max(0, Date.now() - time);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  return "minggu ini";
}
