"use client";

import { useRef, useState } from "react";
import { ImagePlus, Link2, Loader2, Upload, X } from "lucide-react";

import {
  ALLOWED_IMAGE_LABEL,
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
} from "@/lib/upload-constants";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
};

export function SeoImageUpload({ value, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError("Unsupported file type.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Image must be 5 MB or smaller.");
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Upload failed.");
        return;
      }
      onChange(String(json.url || ""));
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          event.target.value = "";
        }}
      />

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="relative aspect-[1200/630] bg-white dark:bg-zinc-950">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              loading="lazy"
              decoding="async"
              src={value}
              alt="Open graph preview"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-400">
              <ImagePlus className="h-6 w-6" aria-hidden="true" />
              <p className="text-xs font-medium">1200 x 630 recommended</p>
            </div>
          )}

          {value && !disabled ? (
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-950/80 text-white transition hover:bg-zinc-950"
              aria-label="Remove OG image"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex min-w-0 flex-1 overflow-hidden rounded-lg border border-zinc-200 bg-white focus-within:ring-2 focus-within:ring-zinc-100 dark:border-zinc-800 dark:bg-zinc-950">
          <span className="flex h-9 items-center border-r border-zinc-200 px-3 text-zinc-400 dark:border-zinc-800">
            <Link2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            placeholder="https://.../og-image.png"
            className="h-9 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none disabled:opacity-60"
          />
        </div>
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
          )}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {uploading ? "Uploading" : "Upload"}
        </button>
      </div>

      <p className="text-[11px] text-zinc-400">
        {ALLOWED_IMAGE_LABEL}. For best previews, use 1200 x 630.
      </p>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
