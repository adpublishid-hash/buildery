"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";

import {
  ALLOWED_IMAGE_LABEL,
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
} from "@/lib/upload-constants";
import { cn } from "@/lib/utils";

type Props = {
  previewUrl: string | null;
  onUploaded: (file: { id: string; url: string }) => void;
  onRemove: () => void;
  disabled?: boolean;
};

export function ImageUpload({
  previewUrl,
  onUploaded,
  onRemove,
  disabled,
}: Props) {
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
      onUploaded({ id: json.id, url: json.url });
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {previewUrl ? (
        <div className="relative w-fit overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img loading="lazy" decoding="async"
            src={previewUrl}
            alt="Product"
            className="h-40 w-40 object-cover"
          />
          {!disabled && (
            <button
              type="button"
              onClick={onRemove}
              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-zinc-900/80 text-white transition hover:bg-zinc-900"
              aria-label="Remove image"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex h-40 w-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 text-zinc-500 transition hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
          )}
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ImagePlus className="h-5 w-5" />
          )}
          <span className="text-xs font-medium">
            {uploading ? "Uploading…" : "Upload image"}
          </span>
        </button>
      )}

      <p className="text-[11px] text-zinc-400">{ALLOWED_IMAGE_LABEL}</p>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
