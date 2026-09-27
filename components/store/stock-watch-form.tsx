"use client";

import { useState, useTransition } from "react";
import { BellRing, Check } from "lucide-react";
import { toast } from "sonner";

import { watchStockAction } from "@/lib/actions/product-engagement";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The way out of a sold-out page.
 *
 * It used to be a dead end: the shopper left and nothing brought them back when
 * stock arrived. No account needed — asking for one here loses the person the
 * form exists to catch.
 */
export function StockWatchForm({
  workspaceSlug,
  productId,
  variantId,
}: {
  workspaceSlug: string;
  productId: string;
  variantId?: string | null;
}) {
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        <Check className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Siap! Kami kabari lewat email begitu produk ini tersedia lagi.</p>
      </div>
    );
  }

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await watchStockAction(workspaceSlug, productId, formData);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          setDone(true);
        })
      }
      className="space-y-2 rounded-lg border border-zinc-200 p-3"
    >
      <p className="flex items-center gap-2 text-sm font-medium text-zinc-900">
        <BellRing className="h-4 w-4" />
        Beritahu saya saat tersedia
      </p>
      <p className="text-xs text-zinc-500">
        Kami kirim satu email begitu stok masuk lagi. Tidak ada email lain.
      </p>
      {variantId ? <input type="hidden" name="variantId" value={variantId} /> : null}
      <div className="flex gap-2">
        <Input
          name="email"
          type="email"
          required
          placeholder="email@anda.com"
          aria-label="Email untuk notifikasi stok"
          className="h-9"
        />
        <Button type="submit" size="sm" disabled={pending} className="h-9">
          {pending ? "Mengirim..." : "Kabari saya"}
        </Button>
      </div>
    </form>
  );
}
