"use client";

import { Monitor, Smartphone, Tablet, X } from "lucide-react";

import type { Block } from "@/lib/blocks/schema";
import {
  clearContentOverride,
  deviceOverrides,
  humanizeField,
  responsiveFieldsFor,
} from "@/lib/blocks/responsive-content";
import type { StyleDevice } from "@/lib/blocks/style";
import { cn } from "@/lib/utils";

const DEVICES = [
  { value: "desktop", label: "Desktop", icon: Monitor },
  { value: "tablet", label: "Tablet", icon: Tablet },
  { value: "mobile", label: "Mobile", icon: Smartphone },
] as const;

/**
 * Top of the Konten tab: which device the form is editing, and — on tablet
 * or mobile — which layout fields this device overrides, each resettable.
 */
export function DeviceContentPanel({
  block,
  device,
  onDeviceChange,
  onChange,
}: {
  block: Block;
  device: StyleDevice;
  onDeviceChange: (device: StyleDevice) => void;
  onChange: (data: Block["data"]) => void;
}) {
  const fields = responsiveFieldsFor(block.type);
  const counts = {
    desktop: 0,
    tablet: Object.keys(deviceOverrides(block.type, block.data, "tablet")).length,
    mobile: Object.keys(deviceOverrides(block.type, block.data, "mobile")).length,
  };
  const overridden = device === "desktop" ? [] : Object.keys(deviceOverrides(block.type, block.data, device));

  return (
    <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="grid grid-cols-3 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
        {DEVICES.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onDeviceChange(option.value)}
              className={cn(
                "flex h-7 items-center justify-center gap-1 rounded-md text-[11px] font-medium transition",
                device === option.value
                  ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              )}
            >
              <Icon className="h-3 w-3" />
              {option.label}
              {counts[option.value] > 0 ? (
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
              ) : null}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
        {fields.length === 0
          ? "Block ini tidak punya pilihan layout per device. Teks dan isinya sama di semua device; tampilannya tetap bisa diatur per device di tab Style."
          : device === "desktop"
            ? "Teks, gambar, dan tautan berlaku di semua device. Pilih Tablet atau Mobile untuk mengatur layout (misalnya Layout, Kolom, Perataan) khusus device itu."
            : `Mode ${device}: perubahan pilihan layout hanya berlaku di ${device}. Mengubah teks, gambar, atau tautan tetap berlaku di semua device.`}
      </p>

      {overridden.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {overridden.map((key) => (
            <span
              key={key}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 pl-2 pr-1 text-[11px] font-medium text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200"
            >
              {humanizeField(key)}
              <button
                type="button"
                aria-label={`Kembalikan ${humanizeField(key)} ke nilai ${device === "mobile" ? "tablet/desktop" : "desktop"}`}
                title="Ikuti device yang lebih besar"
                onClick={() =>
                  onChange(clearContentOverride(block.data, device as "tablet" | "mobile", key))
                }
                className="flex h-4 w-4 items-center justify-center rounded hover:bg-blue-100 dark:hover:bg-blue-900"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => onChange(clearContentOverride(block.data, device as "tablet" | "mobile"))}
            className="h-6 rounded-md px-1.5 text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
          >
            Reset semua
          </button>
        </div>
      ) : null}
    </div>
  );
}
