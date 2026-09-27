"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";

type Asset = { id: string; name: string; kind: string; size: number };

export function CourseAssetUpload({
  courseId,
  asset,
  onChange,
}: {
  courseId: string;
  asset: Asset | null;
  onChange: (asset: Asset | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const data = new FormData();
      data.set("file", file);
      const response = await fetch(`/api/courses/${courseId}/assets`, { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Upload failed.");
      } else {
        onChange(result);
      }
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
        accept="video/mp4,video/webm,application/pdf,application/zip,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.target.value = "";
        }}
      />
      {asset ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-900">{asset.name}</p>
            <p className="text-xs text-zinc-500">{asset.kind.toLowerCase()} · {formatBytes(asset.size)}</p>
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={() => onChange(null)} aria-label="Remove asset">
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="animate-spin" /> : <FileUp />}
          {uploading ? "Uploading" : "Upload private material"}
        </Button>
      )}
      <p className="text-xs text-zinc-500">MP4, WebM, PDF, ZIP, TXT, or DOCX. Maximum 200 MB.</p>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
