"use client";

import { useState, useTransition } from "react";
import { Loader2, Package, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { saveProductBundleAction } from "@/lib/actions/product";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/utils";

export type BundleCandidate = {
  id: string;
  name: string;
  price: number;
  stock: number;
  type: string;
  variants: { id: string; name: string; stock: number }[];
};

type Row = { productId: string; variantId: string | null; quantity: number };

/**
 * What a bundle contains.
 *
 * The bundle keeps no stock of its own — how many can be sold is whatever its
 * scarcest component allows, shown live here so the merchant is not guessing.
 */
export function BundlePanel({
  bundleId,
  candidates,
  initial,
}: {
  bundleId: string;
  candidates: BundleCandidate[];
  initial: Row[];
}) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [pending, startTransition] = useTransition();
  const byId = new Map(candidates.map((product) => [product.id, product]));

  function availableFor(row: Row) {
    const product = byId.get(row.productId);
    if (!product) return 0;
    if (product.type !== "PHYSICAL") return Number.MAX_SAFE_INTEGER;
    const stock = row.variantId
      ? (product.variants.find((variant) => variant.id === row.variantId)?.stock ?? 0)
      : product.stock;
    return Math.floor(stock / Math.max(1, row.quantity));
  }

  const sellable = rows.length
    ? Math.min(...rows.map(availableFor))
    : 0;

  function save() {
    const form = new FormData();
    form.set("items", JSON.stringify(rows));
    startTransition(async () => {
      const result = await saveProductBundleAction(bundleId, form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Isi paket disimpan");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Isi paket</CardTitle>
        <CardDescription>
          Paket tidak punya stok sendiri. Yang bisa dijual ditentukan komponen
          yang paling cepat habis.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Belum ada isi. Paket kosong tidak bisa dibeli.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((row, index) => {
              const product = byId.get(row.productId);
              return (
                <div
                  key={`${row.productId}:${row.variantId ?? ""}`}
                  className="grid gap-2 rounded-lg border border-zinc-200 p-3 md:grid-cols-[minmax(0,1fr)_180px_100px_auto] md:items-end dark:border-zinc-800"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {product?.name ?? "Produk tidak ditemukan"}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {product ? formatPrice(product.price) : ""} · stok{" "}
                      {product?.stock ?? 0}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Varian</Label>
                    <select
                      aria-label={`Varian untuk ${product?.name ?? "produk"}`}
                      className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                      value={row.variantId ?? ""}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((entry, i) =>
                            i === index
                              ? { ...entry, variantId: event.target.value || null }
                              : entry
                          )
                        )
                      }
                    >
                      <option value="">Semua / tanpa varian</option>
                      {product?.variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Jumlah</Label>
                    <Input
                      type="number"
                      min={1}
                      value={row.quantity}
                      aria-label={`Jumlah ${product?.name ?? "produk"}`}
                      className="h-9"
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((entry, i) =>
                            i === index
                              ? {
                                  ...entry,
                                  quantity: Math.max(1, Number(event.target.value) || 1),
                                }
                              : entry
                          )
                        )
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Hapus ${product?.name ?? "komponen"}`}
                    onClick={() =>
                      setRows((current) => current.filter((_, i) => i !== index))
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Tambah produk ke paket"
            className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            value=""
            onChange={(event) => {
              const productId = event.target.value;
              if (!productId) return;
              setRows((current) =>
                current.some((row) => row.productId === productId && !row.variantId)
                  ? current
                  : [...current, { productId, variantId: null, quantity: 1 }]
              );
            }}
          >
            <option value="">Tambah produk…</option>
            {candidates.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" size="sm" disabled>
            <Plus className="h-4 w-4" />
            {rows.length} komponen
          </Button>
          <span className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Package className="h-3.5 w-3.5" />
            {rows.length === 0
              ? "Belum bisa dijual"
              : `Bisa dijual: ${sellable === Number.MAX_SAFE_INTEGER ? "tak terbatas" : sellable}`}
          </span>
          <Button type="button" onClick={save} disabled={pending} className="ml-auto">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Simpan isi paket
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
