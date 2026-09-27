"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { VariantImageInput, type VariantImageValue } from "@/components/products/variant-image-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteProductVariantAction, saveProductVariantAction } from "@/lib/actions/product";
import { formatPrice } from "@/lib/utils";

type Variant = {
  id: string;
  name: string;
  sku: string | null;
  price: number | null;
  discountPrice: number | null;
  costPrice: number | null;
  stock: number;
  weightGrams: number | null;
  lowStockThreshold: number | null;
  imageId: string | null;
  imageUrl: string | null;
  image?: { url: string } | null;
  isActive: boolean;
};

export function ProductVariantsPanel({ productId, variants, tracksInventory }: { productId: string; variants: Variant[]; tracksInventory: boolean }) {
  const [editing, setEditing] = useState<Variant | null | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  function save(formData: FormData) {
    startTransition(async () => {
      const result = await saveProductVariantAction(productId, editing?.id ?? null, formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Varian disimpan");
      setEditing(undefined);
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Varian produk</CardTitle>
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(null)}><Plus className="h-4 w-4" />Tambah</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing !== undefined ? <VariantEditorForm key={editing?.id ?? "new"} variant={editing} tracksInventory={tracksInventory} pending={pending} onCancel={() => setEditing(undefined)} action={save} /> : null}
        {variants.length === 0 ? (
          <p className="text-sm text-zinc-500">Belum ada varian. Produk memakai harga dan stok utama.</p>
        ) : (
          <div className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {variants.map((variant) => (
              <div key={variant.id} className="flex items-center justify-between gap-4 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  {variant.image?.url ?? variant.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={variant.image?.url ?? variant.imageUrl ?? ""} alt="" className="h-11 w-11 shrink-0 rounded-md border border-zinc-200 object-cover dark:border-zinc-800" />
                  ) : null}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{variant.name}{!variant.isActive ? " (nonaktif)" : ""}</p>
                    <p className="text-xs text-zinc-500">
                      {variant.sku || "Tanpa SKU"} · {variant.price == null ? "Harga utama" : formatPrice(variant.price)}
                      {variant.discountPrice != null ? ` → ${formatPrice(variant.discountPrice)}` : ""}
                      {tracksInventory ? ` · Stok ${variant.stock}` : " · Stok tidak dibatasi"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button type="button" size="icon" variant="ghost" onClick={() => setEditing(variant)} aria-label={`Edit ${variant.name}`}><Pencil className="h-4 w-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" aria-label={`Hapus ${variant.name}`} onClick={() => startTransition(async () => { const result = await deleteProductVariantAction(productId, variant.id); if (!result.ok) toast.error(result.error); else toast.success("Varian dihapus"); })}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VariantEditorForm({ variant, tracksInventory, pending, onCancel, action }: { variant: Variant | null; tracksInventory: boolean; pending: boolean; onCancel: () => void; action: (formData: FormData) => void }) {
  const [image, setImage] = useState<VariantImageValue>({ id: variant?.imageId ?? null, url: variant?.image?.url ?? variant?.imageUrl ?? null });
  return (
    <form action={action} className="grid gap-3 rounded-lg border border-zinc-200 p-4 md:grid-cols-3 dark:border-zinc-800">
      <div className="space-y-1.5 md:col-span-2"><Label>Nama</Label><Input name="name" defaultValue={variant?.name ?? ""} placeholder="Contoh: Hitam / XL" required /></div>
      <div className="space-y-1.5"><Label>Gambar</Label><input type="hidden" name="imageId" value={image.id ?? ""} /><input type="hidden" name="imageUrl" value={image.url ?? ""} /><VariantImageInput value={image} onChange={setImage} disabled={pending} label={variant?.name ?? "varian baru"} /></div>
      <div className="space-y-1.5"><Label>Harga normal</Label><Input name="price" type="number" min={0} defaultValue={variant?.price ?? ""} placeholder="Harga utama" /></div>
      <div className="space-y-1.5"><Label>Harga promo</Label><Input name="discountPrice" type="number" min={0} defaultValue={variant?.discountPrice ?? ""} placeholder="Tanpa promo" /></div>
      <div className="space-y-1.5"><Label>HPP</Label><Input name="costPrice" type="number" min={0} defaultValue={variant?.costPrice ?? ""} placeholder="HPP utama" /></div>
      <div className="space-y-1.5"><Label>SKU</Label><Input name="sku" maxLength={80} defaultValue={variant?.sku ?? ""} /></div>
      {tracksInventory ? <>
        <div className="space-y-1.5"><Label>Stok</Label><Input name="stock" type="number" min={0} defaultValue={variant?.stock ?? 0} required /></div>
        <div className="space-y-1.5"><Label>Ambang stok rendah</Label><Input name="lowStockThreshold" type="number" min={0} defaultValue={variant?.lowStockThreshold ?? ""} placeholder="Default toko" /></div>
        <div className="space-y-1.5"><Label>Berat (gram)</Label><Input name="weightGrams" type="number" min={0} defaultValue={variant?.weightGrams ?? ""} placeholder="Berat utama" /></div>
      </> : <input type="hidden" name="stock" value={variant?.stock ?? 0} />}
      {variant ? <label className="flex items-center gap-2 text-sm"><input name="isActive" type="checkbox" value="true" defaultChecked={variant.isActive} />Aktif</label> : null}
      <div className="flex justify-end gap-2 md:col-span-3"><Button type="button" variant="ghost" onClick={onCancel}><X className="h-4 w-4" />Batal</Button><Button type="submit" disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Simpan</Button></div>
    </form>
  );
}
