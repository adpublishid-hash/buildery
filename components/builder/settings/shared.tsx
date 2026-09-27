"use client";

import type {
  NavItem,
} from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";
import {
  Repeatable,
  TextField,
} from "../fields";
import { ImageUrlUpload } from "../image-url-upload";

/**
 * Potongan yang dipakai bersama beberapa form block.
 *
 * Terpisah supaya setiap form block bisa berdiri sebagai modulnya sendiri dan
 * dimuat hanya saat block bertipe itu benar-benar dipilih.
 */
export const ALIGN_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
] as const;

export function NavItemsField({
  label,
  items,
  onChange,
  showDescription = false,
}: {
  label: string;
  items: NavItem[];
  onChange: (items: NavItem[]) => void;
  showDescription?: boolean;
}) {
  return (
    <Repeatable
      label={label}
      items={items}
      onChange={onChange}
      addLabel="Add link"
      makeNew={() => ({ label: "New link", href: "#", description: "", badge: "" })}
      renderItem={(item, patch) => (
        <div className="grid gap-2">
          <TextField
            label="Label"
            value={item.label}
            onChange={(v) => patch({ ...item, label: v })}
          />
          <TextField
            label="Href"
            value={item.href}
            onChange={(v) => patch({ ...item, href: v })}
            placeholder="#section or /page"
          />
          {showDescription ? (
            <TextField
              label="Description"
              value={item.description}
              onChange={(v) => patch({ ...item, description: v })}
            />
          ) : null}
          <TextField
            label="Badge"
            value={item.badge}
            onChange={(v) => patch({ ...item, badge: v })}
            placeholder="New"
          />
        </div>
      )}
    />
  );
}

export function NumberSliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  zeroLabel,
  unit = "px",
  decimals = 0,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  zeroLabel?: string;
  /** Suffix shown next to the value. */
  unit?: string;
  /** Decimal places to keep when the slider emits a value. */
  decimals?: number;
}) {
  const round = (n: number) =>
    decimals > 0 ? Number(n.toFixed(decimals)) : Math.round(n);
  const displayValue =
    zeroLabel && value === 0 ? zeroLabel : `${value.toFixed(decimals)}${unit}`;

  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
          {label}
        </span>
        <span className="min-w-14 rounded-md bg-zinc-100 px-2 py-1 text-right text-[11px] font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
          {displayValue}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(round(Number(event.target.value)))}
          className="h-2 flex-1 cursor-pointer accent-zinc-950 dark:accent-zinc-50"
          aria-label={label}
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isFinite(next)) return;
            onChange(round(Math.min(max, Math.max(min, next))));
          }}
          className="h-8 w-16 rounded-md border border-zinc-200 bg-white px-2 text-right text-xs text-zinc-900 shadow-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
          aria-label={`${label} value`}
        />
      </div>
    </div>
  );
}

export function BioAvatarField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <ImageUrlUpload
        label="Avatar"
        value={value}
        onChange={onChange}
        placeholder="Upload avatar atau paste URL"
        previewClassName="rounded-full"
      />
      <div className="space-y-2">
        <p className="text-xs font-medium text-zinc-900 dark:text-zinc-50">
          Avatar preset
        </p>
        <div className="grid max-h-48 grid-cols-6 gap-2 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
          {BIO_AVATAR_OPTIONS.map((src, index) => (
            <button
              key={src}
              type="button"
              aria-label={`Pakai avatar ${index + 1}`}
              aria-pressed={value === src}
              onClick={() => onChange(src)}
              className={cn(
                "aspect-square overflow-hidden rounded-full border bg-zinc-50 transition hover:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:bg-zinc-900 dark:focus:ring-zinc-700",
                value === src
                  ? "border-zinc-950 ring-2 ring-zinc-950/10 dark:border-zinc-50 dark:ring-zinc-50/20"
                  : "border-zinc-200 dark:border-zinc-800"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function numericStyleValue(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Platform sosial di blok Bio Profile. Nilainya harus persis sama dengan
 * enum `platform` di bioProfileSocialSchema — di luar itu ditolak validasi.
 */
export const BIO_SOCIAL_OPTIONS = [
  { value: "website", label: "Website" },
  { value: "email", label: "Email" },
  { value: "instagram", label: "Instagram" },
  { value: "twitter", label: "Twitter" },
  { value: "x", label: "X" },
  { value: "facebook", label: "Facebook" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "github", label: "GitHub" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
  { value: "discord", label: "Discord" },
  { value: "spotify", label: "Spotify" },
  { value: "dribbble", label: "Dribbble" },
  { value: "behance", label: "Behance" },
  { value: "twitch", label: "Twitch" },
  { value: "custom", label: "Custom" },
] as const;

/**
 * Ikon tautan Bio Profile. Nilainya harus persis kunci LINK_ICONS di
 * bio-profile-block; nilai lain jatuh ke ikon Sparkles saat dirender.
 */
export const BIO_LINK_ICON_OPTIONS = [
  { value: "", label: "None" },
  { value: "sparkles", label: "Sparkles" },
  { value: "mail", label: "Mail" },
  { value: "calendar", label: "Calendar" },
  { value: "star", label: "Star" },
  { value: "heart", label: "Heart" },
  { value: "globe", label: "Globe" },
  { value: "external", label: "External link" },
  { value: "link", label: "Link" },
  { value: "message", label: "Message" },
  { value: "phone", label: "Phone" },
  { value: "shop", label: "Shop" },
  { value: "download", label: "Download" },
  { value: "file", label: "File" },
  { value: "gift", label: "Gift" },
  { value: "user", label: "User" },
  { value: "lock", label: "Lock" },
];

export const BUTTON_ICON_OPTIONS = [
  { value: "", label: "None" },
  { value: "arrow-right", label: "Arrow right" },
  { value: "arrow-up-right", label: "Arrow up-right" },
  { value: "chevron-right", label: "Chevron right" },
  { value: "calendar", label: "Calendar" },
  { value: "card", label: "Credit card" },
  { value: "check", label: "Check" },
  { value: "copy", label: "Copy" },
  { value: "download", label: "Download" },
  { value: "external-link", label: "External link" },
  { value: "file", label: "File" },
  { value: "gift", label: "Gift" },
  { value: "globe", label: "Globe" },
  { value: "headphones", label: "Headphones" },
  { value: "heart", label: "Heart" },
  { value: "instagram", label: "Instagram" },
  { value: "link", label: "Link" },
  { value: "lock", label: "Lock" },
  { value: "mail", label: "Mail" },
  { value: "map", label: "Map pin" },
  { value: "message", label: "Message" },
  { value: "phone", label: "Phone" },
  { value: "play", label: "Play" },
  { value: "plus", label: "Plus" },
  { value: "send", label: "Send" },
  { value: "shop", label: "Shop" },
  { value: "sparkles", label: "Sparkles" },
  { value: "star", label: "Star" },
  { value: "user", label: "User plus" },
  { value: "youtube", label: "YouTube" },
  { value: "zap", label: "Zap" },
];

export const BIO_AVATAR_OPTIONS = Array.from(
  { length: 48 },
  (_, index) => `/avatar/${index + 1}.png`
);
