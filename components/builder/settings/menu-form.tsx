"use client";

import type {
  MenuData,
} from "@/lib/blocks/schema";
import {
  AreaField,
  ChoiceField,
  TextField,
  ToggleField,
} from "../fields";
import {
  ALIGN_OPTIONS,
  NavItemsField,
} from "./shared";

export function MenuForm({
  data,
  onChange,
}: {
  data: MenuData;
  onChange: (d: MenuData) => void;
}) {
  const set = (patch: Partial<MenuData>) => onChange({ ...data, ...patch });
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Layout"
          value={data.layout ?? "pills"}
          onChange={(v) => set({ layout: v })}
          options={[
            { value: "pills", label: "Pills" },
            { value: "list", label: "List" },
            { value: "grid", label: "Grid" },
            { value: "compact", label: "Compact" },
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
            { value: "accent", label: "Accent" },
          ]}
        />
        <ChoiceField
          label="Width"
          value={data.width ?? "wide"}
          onChange={(v) => set({ width: v })}
          options={[
            { value: "narrow", label: "Narrow" },
            { value: "wide", label: "Wide" },
            { value: "full", label: "Full" },
          ]}
        />
        <ChoiceField
          label="Columns"
          value={String(data.columns ?? 3)}
          onChange={(v) => set({ columns: Number(v) as 2 | 3 | 4 })}
          options={[
            { value: "2", label: "2" },
            { value: "3", label: "3" },
            { value: "4", label: "4" },
          ]}
        />
      </div>
      <ChoiceField
        label="Align"
        value={data.align ?? "center"}
        onChange={(v) => set({ align: v })}
        options={[...ALIGN_OPTIONS]}
      />
      <TextField label="Eyebrow" value={data.eyebrow} onChange={(v) => set({ eyebrow: v })} />
      <TextField label="Heading" value={data.heading} onChange={(v) => set({ heading: v })} />
      <AreaField label="Description" value={data.description} onChange={(v) => set({ description: v })} />
      <div className="grid grid-cols-2 gap-2">
        <ToggleField label="Show header" checked={data.showHeader} onChange={(v) => set({ showHeader: v })} />
        <ToggleField label="Descriptions" checked={data.showDescriptions} onChange={(v) => set({ showDescriptions: v })} />
      </div>
      <NavItemsField
        label="Menu items"
        items={data.items}
        showDescription
        onChange={(items) => set({ items })}
      />
    </>
  );
}
