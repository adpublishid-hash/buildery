"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/lib/upload-constants";

export type VariantImageValue = { id: string | null; url: string | null };

export function VariantImageInput({ value, onChange, disabled, label }: { value: VariantImageValue; onChange: (value: VariantImageValue) => void; disabled?: boolean; label: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return toast.error("Format gambar tidak didukung.");
    if (file.size > MAX_UPLOAD_BYTES) return toast.error("Ukuran gambar maksimal 5 MB.");
    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/upload", { method: "POST", body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.id || !result.url) {
        toast.error(result.error ?? "Upload gambar gagal.");
        return;
      }
      onChange({ id: result.id, url: result.url });
    } catch {
      toast.error("Upload gambar gagal. Periksa koneksi lalu coba lagi.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input ref={inputRef} type="file" accept={ALLOWED_IMAGE_TYPES.join(",")} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled || uploading} aria-label={`Upload gambar ${label}`} className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 text-zinc-500 hover:border-zinc-400 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900">
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : value.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value.url} alt="" className="h-full w-full object-cover" />
        ) : <ImagePlus className="h-4 w-4" />}
      </button>
      {value.url ? <Button type="button" variant="ghost" size="icon" disabled={disabled || uploading} onClick={() => onChange({ id: null, url: null })} aria-label={`Hapus gambar ${label}`}><Trash2 className="h-4 w-4" /></Button> : null}
    </div>
  );
}
