"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Loader2, Warehouse } from "lucide-react";
import { toast } from "sonner";

import {
  setLocationStockAction,
  transferLocationStockAction,
} from "@/lib/actions/product";
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

type Location = { id: string; name: string };

/**
 * Where a product's stock sits.
 *
 * Deliberately a record and not an allocation: the sellable number is still the
 * product's own. The figure worth watching is what has not been placed
 * anywhere — that gap is almost always a counting mistake.
 */
export function LocationStockPanel({
  productId,
  productStock,
  locations,
  rows,
}: {
  productId: string;
  productStock: number;
  locations: Location[];
  rows: { locationId: string; locationName: string; quantity: number }[];
}) {
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState(locations[0]?.id ?? "");
  const [to, setTo] = useState(locations[1]?.id ?? "");

  const placed = rows.reduce((sum, row) => sum + row.quantity, 0);
  const unplaced = productStock - placed;
  const byLocation = new Map(rows.map((row) => [row.locationId, row.quantity]));

  function save(formData: FormData) {
    startTransition(async () => {
      const result = await setLocationStockAction(formData);
      if (!result.ok) toast.error(result.error);
      else toast.success("Stok lokasi disimpan");
    });
  }

  function move(formData: FormData) {
    startTransition(async () => {
      const result = await transferLocationStockAction(formData);
      if (!result.ok) toast.error(result.error);
      else toast.success("Stok dipindahkan");
    });
  }

  if (locations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Stok per lokasi</CardTitle>
          <CardDescription>
            Tambahkan lokasi di Pengaturan → eCommerce untuk mencatat stok per
            gudang.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stok per lokasi</CardTitle>
        <CardDescription>
          Catatan lokasi fisik barang. Yang bisa dijual tetap stok produk
          ({productStock}), jadi tidak ada dua angka yang bisa berbeda.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {locations.map((location) => (
            <form
              key={location.id}
              action={save}
              className="flex flex-wrap items-end gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="locationId" value={location.id} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Warehouse className="h-3.5 w-3.5 text-zinc-400" />
                  {location.name}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`qty-${location.id}`} className="text-xs">
                  Jumlah
                </Label>
                <Input
                  id={`qty-${location.id}`}
                  name="quantity"
                  type="number"
                  min={0}
                  defaultValue={byLocation.get(location.id) ?? 0}
                  className="h-9 w-28"
                />
              </div>
              <Button type="submit" size="sm" variant="outline" disabled={pending}>
                Simpan
              </Button>
            </form>
          ))}
        </div>

        <p
          className={
            unplaced === 0
              ? "text-xs text-zinc-500"
              : "rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
          }
        >
          {unplaced === 0
            ? `Semua ${placed} unit sudah tercatat lokasinya.`
            : unplaced > 0
              ? `${unplaced} unit belum tercatat di lokasi mana pun.`
              : `${Math.abs(unplaced)} unit lebih banyak tercatat daripada stok produk — periksa hitungannya.`}
        </p>

        {locations.length > 1 ? (
          <form
            action={move}
            className="flex flex-wrap items-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800"
          >
            <input type="hidden" name="productId" value={productId} />
            <div className="space-y-1.5">
              <Label className="text-xs">Dari</Label>
              <select
                name="fromLocationId"
                aria-label="Lokasi asal"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
            <ArrowRight className="mb-2 h-4 w-4 text-zinc-400" />
            <div className="space-y-1.5">
              <Label className="text-xs">Ke</Label>
              <select
                name="toLocationId"
                aria-label="Lokasi tujuan"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transfer-qty" className="text-xs">
                Jumlah
              </Label>
              <Input
                id="transfer-qty"
                name="quantity"
                type="number"
                min={1}
                defaultValue={1}
                className="h-9 w-28"
              />
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Pindahkan
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
