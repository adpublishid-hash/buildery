"use client";

import { useId, useRef, useState } from "react";
import { ImagePlus, Link2, Loader2, Upload, X } from "lucide-react";

import {
  ALLOWED_IMAGE_LABEL,
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
} from "@/lib/upload-constants";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
  previewClassName?: string;
};

export function ImageUrlUpload({
  label,
  value,
  onChange,
  placeholder = "https://.../image.png",
  previewClassName,
}: Props) {
  const id = useId();
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
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block text-xs font-medium text-zinc-900 dark:text-zinc-50"
      >
        {label}
      </label>
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

      <div className="flex gap-3">
        <div
          className={cn(
            "relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-zinc-50 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900",
            previewClassName
          )}
        >
          {value ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                loading="lazy"
                decoding="async"
                src={value}
                alt=""
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => onChange("")}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md bg-zinc-950/80 text-white transition hover:bg-zinc-950"
                aria-label={`Remove ${label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </>
          ) : (
            <ImagePlus className="h-5 w-5" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white focus-within:ring-2 focus-within:ring-zinc-100 dark:border-zinc-800 dark:bg-zinc-950">
            <span className="flex h-9 items-center border-r border-zinc-200 px-2.5 text-zinc-400 dark:border-zinc-800">
              <Link2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <input
              id={id}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder={placeholder}
              className="h-9 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
            />
          </div>
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {uploading ? "Uploading" : "Upload"}
          </button>
        </div>
      </div>

      <p className="text-[11px] text-zinc-400">{ALLOWED_IMAGE_LABEL}</p>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
