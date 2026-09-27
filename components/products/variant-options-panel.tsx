"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import {
  bulkUpdateProductVariantsAction,
  deleteProductVariantAction,
  saveProductVariantOptionsAction,
} from "@/lib/actions/product";
import {
  MAX_VALUES_PER_AXIS,
  MAX_VARIANT_AXES,
  readVariantOptions,
  variantCombinations,
  variantName,
  variantOptionKey,
  type VariantOptionValues,
  type VariantAxis,
} from "@/lib/product-variants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VariantImageInput, type VariantImageValue } from "@/components/products/variant-image-input";

type Variant = {
  id: string;
  name: string;
  sku: string | null;
  price: number | null;
  discountPrice: number | null;
  costPrice: number | null;
  stock: number;
  weightGrams: number | null;
  imageUrl: string | null;
  imageId: string | null;
  image?: { url: string } | null;
  lowStockThreshold: number | null;
  isActive: boolean;
  options: unknown;
};

function AxisValuesInput({
  id,
  values,
  onChange,
}: {
  id: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  // Keep the raw text locally. Deriving `value` from the parsed array removes
  // a trailing comma immediately, making it impossible to type the next item.
  const [raw, setRaw] = useState(values.join(", "));

  return (
    <Input
      id={id}
      value={raw}
      placeholder="Hitam, Putih, Merah"
      onChange={(event) => {
        const nextRaw = event.target.value;
        setRaw(nextRaw);
        onChange(
          nextRaw
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
            .slice(0, MAX_VALUES_PER_AXIS)
        );
      }}
    />
  );
}

export type DraftVariantRow = {
  key: string;
  name: string;
  options: VariantOptionValues;
  sku: string;
  price: string;
  discountPrice: string;
  costPrice: string;
  stock: string;
  weightGrams: string;
  lowStockThreshold: string;
  imageId: string | null;
  imageUrl: string | null;
  isActive: boolean;
};

export function reconcileDraftVariantRows(
  axes: VariantAxis[],
  current: DraftVariantRow[]
): DraftVariantRow[] {
  const existing = new Map(current.map((row) => [row.key, row]));
  return variantCombinations(axes).map((options) => {
    const key = variantOptionKey(options);
    const previous = existing.get(key);
    return {
      key,
      name: variantName(axes, options),
      options,
      sku: previous?.sku ?? "",
      price: previous?.price ?? "",
      discountPrice: previous?.discountPrice ?? "",
      costPrice: previous?.costPrice ?? "",
      stock: previous?.stock ?? "0",
      weightGrams: previous?.weightGrams ?? "",
      lowStockThreshold: previous?.lowStockThreshold ?? "",
      imageId: previous?.imageId ?? null,
      imageUrl: previous?.imageUrl ?? null,
      isActive: previous?.isActive ?? true,
    };
  });
}

function PersistedVariantImageCell({
  variant,
  pending,
}: {
  variant: Variant;
  pending: boolean;
}) {
  const [image, setImage] = useState<VariantImageValue>({
    id: variant.imageId,
    url: variant.image?.url ?? variant.imageUrl,
  });

  return (
    <>
      <input type="hidden" name={`imageId:${variant.id}`} value={image.id ?? ""} />
      <input type="hidden" name={`image:${variant.id}`} value={image.url ?? ""} />
      <VariantImageInput
        value={image}
        onChange={setImage}
        disabled={pending}
        label={variant.name}
      />
    </>
  );
}

/**
 * Variants as a matrix of option axes.
 *
 * Before this a merchant with three colours and four sizes created twelve rows
 * by hand and typed each name consistently; the storefront could then only show
 * that flat list back. Here the axes are declared once, the combinations are
 * generated, and stock and price are edited in one grid.
 */
export function VariantOptionsPanel({
  productId,
  axes: savedAxes,
  variants,
  tracksInventory,
}: {
  productId: string;
  axes: VariantAxis[];
  variants: Variant[];
  tracksInventory: boolean;
}) {
  const [axes, setAxes] = useState<VariantAxis[]>(savedAxes);
  const [orphaned, setOrphaned] = useState<{ id: string; name: string }[]>([]);
  const [pending, startTransition] = useTransition();

  const combinationCount = variantCombinations(axes).length;

  function updateAxis(index: number, next: Partial<VariantAxis>) {
    setAxes((current) =>
      current.map((axis, i) => (i === index ? { ...axis, ...next } : axis))
    );
  }

  function generate() {
    const form = new FormData();
    form.set("axes", JSON.stringify(axes));
    startTransition(async () => {
      const result = await saveProductVariantOptionsAction(productId, form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setOrphaned(result.data?.orphaned ?? []);
      const created = result.data?.created ?? 0;
      toast.success(
        created > 0 ? `${created} varian dibuat` : "Opsi varian disimpan"
      );
    });
  }

  function saveGrid(formData: FormData) {
    startTransition(async () => {
      const result = await bulkUpdateProductVariantsAction(productId, formData);
      if (!result.ok) toast.error(result.error);
      else toast.success("Stok & harga varian disimpan");
    });
  }

  function removeVariant(variant: Variant) {
    if (!window.confirm(`Hapus varian ${variant.name}?`)) return;
    startTransition(async () => {
      const result = await deleteProductVariantAction(productId, variant.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Varian dihapus");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Varian produk</CardTitle>
        <CardDescription>
          Tentukan pilihan seperti Warna dan Ukuran. Kombinasi varian, harga,
          stok, dan gambarnya dikelola di sini.
          {!tracksInventory ? " Varian digital tersedia tanpa batas stok." : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {axes.map((axis, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-lg border border-zinc-200 p-3 md:grid-cols-[200px_minmax(0,1fr)_auto] dark:border-zinc-800"
          >
            <div className="space-y-1.5">
              <Label htmlFor={`axis-name-${index}`}>Nama opsi</Label>
              <Input
                id={`axis-name-${index}`}
                value={axis.name}
                maxLength={40}
                placeholder="Warna"
                onChange={(event) => updateAxis(index, { name: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`axis-values-${index}`}>
                Nilai (pisahkan dengan koma)
              </Label>
              <AxisValuesInput
                id={`axis-values-${index}`}
                values={axis.values}
                onChange={(values) => updateAxis(index, { values })}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Hapus opsi ${axis.name || index + 1}`}
                onClick={() => setAxes((current) => current.filter((_, i) => i !== index))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={axes.length >= MAX_VARIANT_AXES}
            onClick={() => setAxes((current) => [...current, { name: "", values: [] }])}
          >
            <Plus className="h-4 w-4" />
            Tambah opsi
          </Button>
          <Button type="button" size="sm" onClick={generate} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Terapkan opsi
          </Button>
          {combinationCount > 0 ? (
            <span className="text-xs text-zinc-500">
              {combinationCount} kombinasi
            </span>
          ) : null}
        </div>

        {orphaned.length > 0 ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-semibold">
              {orphaned.length} varian tidak lagi cocok dengan opsi di atas.
            </p>
            <p className="mt-1">
              Varian ini tidak dihapus otomatis karena mungkin masih menyimpan
              stok: {orphaned.map((variant) => variant.name).join(", ")}. Hapus
              melalui tombol hapus pada tabel jika memang tidak dipakai.
            </p>
          </div>
        ) : null}

        {variants.length > 0 ? (
          <form action={saveGrid} className="space-y-3">
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full min-w-[1180px] text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th className="px-3 py-2">Varian</th>
                    <th className="w-28 px-3 py-2">Gambar</th>
                    {tracksInventory ? <th className="px-3 py-2 w-24">Stok</th> : null}
                    <th className="px-3 py-2 w-32">Harga normal</th>
                    <th className="px-3 py-2 w-32">Harga promo</th>
                    <th className="px-3 py-2 w-32">HPP</th>
                    {tracksInventory ? <th className="px-3 py-2 w-28">Berat (g)</th> : null}
                    <th className="px-3 py-2 w-32">SKU</th>
                    {tracksInventory ? <th className="px-3 py-2 w-28">Stok rendah</th> : null}
                    <th className="px-3 py-2 w-16 text-center">Aktif</th>
                    <th className="w-12 px-3 py-2"><span className="sr-only">Aksi</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {variants.map((variant) => {
                    const options = readVariantOptions(variant.options as never);
                    const labels = Object.entries(options);
                    return (
                      <tr key={variant.id}>
                        <td className="px-3 py-2">
                          <p className="font-medium">{variant.name}</p>
                          {labels.length > 0 ? (
                            <p className="text-xs text-zinc-500">
                              {labels.map(([axis, value]) => `${axis}: ${value}`).join(" · ")}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2"><PersistedVariantImageCell variant={variant} pending={pending} /></td>
                        {tracksInventory ? <td className="px-3 py-2">
                          <Input
                            name={`stock:${variant.id}`}
                            type="number"
                            min={0}
                            defaultValue={variant.stock}
                            aria-label={`Stok ${variant.name}`}
                            className="h-9"
                          />
                        </td> : <input type="hidden" name={`stock:${variant.id}`} value={variant.stock} />}
                        <td className="px-3 py-2">
                          <Input
                            name={`price:${variant.id}`}
                            type="number"
                            min={0}
                            defaultValue={variant.price ?? ""}
                            placeholder="Harga utama"
                            aria-label={`Harga ${variant.name}`}
                            className="h-9"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input name={`discount:${variant.id}`} type="number" min={0} defaultValue={variant.discountPrice ?? ""} placeholder="Tanpa promo" aria-label={`Harga promo ${variant.name}`} className="h-9" />
                        </td>
                        <td className="px-3 py-2">
                          <Input name={`cost:${variant.id}`} type="number" min={0} defaultValue={variant.costPrice ?? ""} placeholder="HPP utama" aria-label={`HPP ${variant.name}`} className="h-9" />
                        </td>
                        {tracksInventory ? (
                          <td className="px-3 py-2">
                            <Input
                              name={`weight:${variant.id}`}
                              type="number"
                              min={0}
                              defaultValue={variant.weightGrams ?? ""}
                              placeholder="Berat utama"
                              aria-label={`Berat ${variant.name}`}
                              className="h-9"
                            />
                          </td>
                        ) : (
                          <input
                            type="hidden"
                            name={`weight:${variant.id}`}
                            value={variant.weightGrams ?? ""}
                          />
                        )}
                        <td className="px-3 py-2">
                          <Input
                            name={`sku:${variant.id}`}
                            defaultValue={variant.sku ?? ""}
                            aria-label={`SKU ${variant.name}`}
                            className="h-9"
                          />
                        </td>
                        {tracksInventory ? <td className="px-3 py-2"><Input name={`threshold:${variant.id}`} type="number" min={0} defaultValue={variant.lowStockThreshold ?? ""} placeholder="Default" aria-label={`Ambang stok ${variant.name}`} className="h-9" /></td> : null}
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            name={`active:${variant.id}`}
                            value="true"
                            defaultChecked={variant.isActive}
                            aria-label={`Aktifkan ${variant.name}`}
                            className="h-4 w-4"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Button type="button" variant="ghost" size="icon" disabled={pending} aria-label={`Hapus ${variant.name}`} onClick={() => removeVariant(variant)}>
                            <Trash2 className="h-4 w-4 text-zinc-400" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {tracksInventory ? "Simpan stok & harga" : "Simpan varian"}
              </Button>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function DraftVariantOptionsPanel({
  axes,
  onChange,
  variants,
  onVariantsChange,
  tracksInventory,
}: {
  axes: VariantAxis[];
  onChange: (axes: VariantAxis[]) => void;
  variants: DraftVariantRow[];
  onVariantsChange: (variants: DraftVariantRow[]) => void;
  tracksInventory: boolean;
}) {
  const combinationCount = variantCombinations(axes).length;

  function updateAxis(index: number, next: Partial<VariantAxis>) {
    onChange(
      axes.map((axis, axisIndex) =>
        axisIndex === index ? { ...axis, ...next } : axis
      )
    );
  }

  function updateVariant(key: string, next: Partial<DraftVariantRow>) {
    onVariantsChange(
      variants.map((variant) =>
        variant.key === key ? { ...variant, ...next } : variant
      )
    );
  }

  return (
    <Card id="variants" className="scroll-mt-6">
      <CardHeader>
        <CardTitle>Varian produk</CardTitle>
        <CardDescription>
          Tambahkan pilihan seperti Warna dan Ukuran. Semua kombinasi akan
          dibuat otomatis saat produk disimpan.
          {!tracksInventory ? " Varian digital tersedia tanpa batas stok." : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {axes.map((axis, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-lg border border-zinc-200 p-3 md:grid-cols-[200px_minmax(0,1fr)_auto] dark:border-zinc-800"
          >
            <div className="space-y-1.5">
              <Label htmlFor={`draft-axis-name-${index}`}>Nama opsi</Label>
              <Input
                id={`draft-axis-name-${index}`}
                value={axis.name}
                maxLength={40}
                placeholder="Warna"
                onChange={(event) =>
                  updateAxis(index, { name: event.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`draft-axis-values-${index}`}>
                Nilai (pisahkan dengan koma)
              </Label>
              <AxisValuesInput
                id={`draft-axis-values-${index}`}
                values={axis.values}
                onChange={(values) => updateAxis(index, { values })}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Hapus opsi ${axis.name || index + 1}`}
                onClick={() =>
                  onChange(axes.filter((_, axisIndex) => axisIndex !== index))
                }
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={axes.length >= MAX_VARIANT_AXES}
            onClick={() => onChange([...axes, { name: "", values: [] }])}
          >
            <Plus className="h-4 w-4" />
            Tambah opsi
          </Button>
          {combinationCount > 0 ? (
            <span className="text-xs text-zinc-500">
              {combinationCount} varian akan dibuat bersama produk
            </span>
          ) : (
            <span className="text-xs text-zinc-500">
              Opsional. Produk tanpa opsi memakai harga dan stok utama.
            </span>
          )}
        </div>

        {variants.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  Detail varian
                </p>
                <p className="text-xs text-zinc-500">
                  Kolom kosong mewarisi nilai utama produk.
                </p>
              </div>
              <span className="text-xs text-zinc-500">{variants.length} varian</span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full min-w-[1180px] text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th className="px-3 py-2">Varian</th>
                    <th className="w-28 px-3 py-2">Gambar</th>
                    {tracksInventory ? <th className="w-24 px-3 py-2">Stok</th> : null}
                    <th className="w-32 px-3 py-2">Harga normal</th>
                    <th className="w-32 px-3 py-2">Harga promo</th>
                    <th className="w-32 px-3 py-2">HPP</th>
                    {tracksInventory ? <th className="w-28 px-3 py-2">Berat (g)</th> : null}
                    <th className="w-32 px-3 py-2">SKU</th>
                    {tracksInventory ? <th className="w-28 px-3 py-2">Stok rendah</th> : null}
                    <th className="w-16 px-3 py-2 text-center">Aktif</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {variants.map((variant) => (
                    <tr key={variant.key}>
                      <td className="px-3 py-2">
                        <p className="font-medium">{variant.name}</p>
                        <p className="text-xs text-zinc-500">
                          {Object.entries(variant.options)
                            .map(([axis, value]) => `${axis}: ${value}`)
                            .join(" · ")}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <VariantImageInput
                          value={{ id: variant.imageId, url: variant.imageUrl }}
                          onChange={(image) =>
                            updateVariant(variant.key, {
                              imageId: image.id,
                              imageUrl: image.url,
                            })
                          }
                          label={variant.name}
                        />
                      </td>
                      {tracksInventory ? (
                        <td className="px-3 py-2">
                          <Input type="number" min={0} value={variant.stock} aria-label={`Stok ${variant.name}`} className="h-9" onChange={(event) => updateVariant(variant.key, { stock: event.target.value })} />
                        </td>
                      ) : null}
                      <td className="px-3 py-2">
                        <Input type="number" min={0} value={variant.price} placeholder="Harga utama" aria-label={`Harga ${variant.name}`} className="h-9" onChange={(event) => updateVariant(variant.key, { price: event.target.value })} />
                      </td>
                      <td className="px-3 py-2">
                        <Input type="number" min={0} value={variant.discountPrice} placeholder="Tanpa promo" aria-label={`Harga promo ${variant.name}`} className="h-9" onChange={(event) => updateVariant(variant.key, { discountPrice: event.target.value })} />
                      </td>
                      <td className="px-3 py-2">
                        <Input type="number" min={0} value={variant.costPrice} placeholder="HPP utama" aria-label={`HPP ${variant.name}`} className="h-9" onChange={(event) => updateVariant(variant.key, { costPrice: event.target.value })} />
                      </td>
                      {tracksInventory ? (
                        <td className="px-3 py-2">
                          <Input type="number" min={0} value={variant.weightGrams} placeholder="Berat utama" aria-label={`Berat ${variant.name}`} className="h-9" onChange={(event) => updateVariant(variant.key, { weightGrams: event.target.value })} />
                        </td>
                      ) : null}
                      <td className="px-3 py-2">
                        <Input value={variant.sku} maxLength={80} aria-label={`SKU ${variant.name}`} className="h-9" onChange={(event) => updateVariant(variant.key, { sku: event.target.value })} />
                      </td>
                      {tracksInventory ? (
                        <td className="px-3 py-2">
                          <Input type="number" min={0} value={variant.lowStockThreshold} placeholder="Default" aria-label={`Ambang stok ${variant.name}`} className="h-9" onChange={(event) => updateVariant(variant.key, { lowStockThreshold: event.target.value })} />
                        </td>
                      ) : null}
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={variant.isActive} onChange={(event) => updateVariant(variant.key, { isActive: event.target.checked })} aria-label={`Aktifkan ${variant.name}`} className="h-4 w-4" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
