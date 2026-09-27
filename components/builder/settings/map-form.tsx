"use client";

import type { MapData } from "@/lib/blocks/schema";
import {
  AreaField,
  ChoiceField,
  TextField,
  ToggleField,
} from "../fields";
import { ALIGN_OPTIONS } from "./shared";

export function MapForm({
  data,
  onChange,
}: {
  data: MapData;
  onChange: (d: MapData) => void;
}) {
  const set = (patch: Partial<MapData>) => onChange({ ...data, ...patch });
  return (
    <>
      <TextField label="Eyebrow" value={data.eyebrow} onChange={(v) => set({ eyebrow: v })} />
      <TextField label="Judul" value={data.heading} onChange={(v) => set({ heading: v })} />
      <AreaField
        label="Deskripsi"
        value={data.description}
        onChange={(v) => set({ description: v })}
        rows={2}
      />
      <AreaField
        label="Alamat"
        value={data.address}
        onChange={(v) => set({ address: v })}
        rows={3}
        placeholder="Jl. Contoh No. 1, Kota"
      />
      <TextField
        label="Titik peta (opsional)"
        value={data.query}
        onChange={(v) => set({ query: v })}
        placeholder="-6.2000, 106.8166 atau nama tempat"
        hint="Kosongkan untuk memakai alamat. Isi koordinat bila pin jatuh di tempat yang salah."
      />
      <AreaField
        label="Jam buka"
        value={data.openingHours}
        onChange={(v) => set({ openingHours: v })}
        rows={2}
        placeholder="Senin–Sabtu, 09.00–17.00"
      />
      <TextField
        label="Telepon"
        value={data.phone}
        onChange={(v) => set({ phone: v })}
        placeholder="021xxxxxxx"
      />
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Tata letak"
          value={data.layout}
          onChange={(v) => set({ layout: v })}
          options={[
            { value: "split", label: "Berdampingan" },
            { value: "stacked", label: "Bertumpuk" },
          ]}
        />
        <ChoiceField
          label="Tinggi peta"
          value={data.height}
          onChange={(v) => set({ height: v })}
          options={[
            { value: "sm", label: "Pendek" },
            { value: "md", label: "Sedang" },
            { value: "lg", label: "Tinggi" },
          ]}
        />
      </div>
      <ChoiceField
        label="Zoom"
        value={String(data.zoom ?? 15)}
        onChange={(v) => set({ zoom: Number(v) })}
        options={[
          { value: "12", label: "Kota" },
          { value: "15", label: "Lingkungan" },
          { value: "17", label: "Jalan" },
          { value: "19", label: "Bangunan" },
        ]}
      />
      <ChoiceField
        label="Perataan"
        value={data.align}
        onChange={(v) => set({ align: v })}
        options={ALIGN_OPTIONS as never}
      />
      <ToggleField
        label="Tombol petunjuk arah"
        checked={data.showDirections}
        onChange={(v) => set({ showDirections: v })}
      />
      {data.showDirections ? (
        <TextField
          label="Label petunjuk arah"
          value={data.directionsLabel}
          onChange={(v) => set({ directionsLabel: v })}
        />
      ) : null}
    </>
  );
}
