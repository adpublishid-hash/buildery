"use client";

import type {
  LogosData,
} from "@/lib/blocks/schema";
import {
  AreaField,
  ChoiceField,
  Repeatable,
  TextField,
  ToggleField,
} from "../fields";

export function LogosForm({
  data,
  onChange,
}: {
  data: LogosData;
  onChange: (d: LogosData) => void;
}) {
  const set = (patch: Partial<LogosData>) => onChange({ ...data, ...patch });
  return (
    <>
      <TextField label="Eyebrow" value={data.eyebrow ?? ""} onChange={(v) => set({ eyebrow: v })} placeholder="Optional" />
      <TextField label="Heading" value={data.heading} onChange={(v) => set({ heading: v })} placeholder="Optional" />
      <AreaField label="Subheading" value={data.subheading ?? ""} onChange={(v) => set({ subheading: v })} rows={2} placeholder="Optional" />
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Layout"
          value={data.layout ?? "cloud"}
          onChange={(v) => set({ layout: v })}
          options={[
            { value: "cloud", label: "Cloud" },
            { value: "grid", label: "Grid" },
            { value: "cards", label: "Cards" },
            { value: "strip", label: "Strip" },
            { value: "plain", label: "Plain" },
          ]}
        />
        <ChoiceField
          label="Tone"
          value={data.tone ?? "light"}
          onChange={(v) => set({ tone: v })}
          options={[
            { value: "light", label: "Light" },
            { value: "soft", label: "Soft" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Columns"
          value={String(data.columns ?? 5)}
          onChange={(v) => {
            const n = Number(v);
            set({ columns: n === 3 ? 3 : n === 4 ? 4 : 5 });
          }}
          options={[
            { value: "3", label: "3 columns" },
            { value: "4", label: "4 columns" },
            { value: "5", label: "5 columns" },
          ]}
        />
        <ChoiceField
          label="Logo size"
          value={data.logoSize ?? "md"}
          onChange={(v) => set({ logoSize: v })}
          options={[
            { value: "sm", label: "Small" },
            { value: "md", label: "Medium" },
            { value: "lg", label: "Large" },
          ]}
        />
      </div>
      <ChoiceField
        label="Alignment"
        value={data.align ?? "center"}
        onChange={(v) => set({ align: v })}
        options={[
          { value: "center", label: "Center" },
          { value: "left", label: "Left" },
        ]}
      />
      <ToggleField label="Grayscale logos" checked={data.grayscale ?? true} onChange={(v) => set({ grayscale: v })} />
      <Repeatable
        label="Logos"
        items={data.items}
        onChange={(items) => set({ items })}
        addLabel="Add logo"
        makeNew={() => ({ name: "Company", url: "", href: "", category: "", featured: false })}
        renderItem={(item, patch) => (
          <>
            <TextField label="Name" value={item.name} onChange={(v) => patch({ ...item, name: v })} />
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Link" value={item.href ?? ""} onChange={(v) => patch({ ...item, href: v })} placeholder="Optional" />
              <TextField label="Category" value={item.category ?? ""} onChange={(v) => patch({ ...item, category: v })} placeholder="Optional" />
            </div>
            <ToggleField label="Feature this logo" checked={item.featured ?? false} onChange={(v) => patch({ ...item, featured: v })} />
            <TextField label="Logo image URL" value={item.url} onChange={(v) => patch({ ...item, url: v })} placeholder="Optional — falls back to name" />
          </>
        )}
      />
    </>
  );
}
