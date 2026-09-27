"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { deleteMediaAction } from "@/lib/actions/media";

export type MediaItem = {
  id: string;
  url: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: string;
};

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function MediaGrid({
  items,
  canEdit,
}: {
  items: MediaItem[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove(item: MediaItem) {
    setPendingId(item.id);
    startTransition(async () => {
      const res = await deleteMediaAction(item.id);
      setPendingId(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Berkas dihapus.");
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-12 text-center text-sm text-zinc-500">
        Belum ada berkas. Gambar yang kamu unggah dari builder, produk, atau
        blog muncul di sini.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <figure
          key={item.id}
          className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="aspect-square bg-zinc-50 dark:bg-zinc-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.url}
              alt={item.name}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-contain"
            />
          </div>
          <figcaption className="space-y-2 p-3">
            <p className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">
              {item.name}
            </p>
            <p className="text-[11px] text-zinc-500">
              {formatSize(item.size)} · {item.mimeType.replace("image/", "")}
            </p>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 flex-1 px-2 text-[11px]"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(item.url)
                    .then(() => toast.success("URL disalin"))
                    .catch(() => toast.error("Gagal menyalin"));
                }}
              >
                <Copy className="h-3 w-3" />
                Salin URL
              </Button>
              {canEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-red-600 hover:text-red-700"
                  disabled={pending && pendingId === item.id}
                  onClick={() => remove(item)}
                  aria-label={`Hapus ${item.name}`}
                >
                  {pending && pendingId === item.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </Button>
              ) : null}
            </div>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
