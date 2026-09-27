"use client";

import type {
  StatsData,
} from "@/lib/blocks/schema";
import {
  AreaField,
  ChoiceField,
  Repeatable,
  TextField,
  ToggleField,
} from "../fields";

export function StatsForm({
  data,
  onChange,
}: {
  data: StatsData;
  onChange: (d: StatsData) => void;
}) {
  const set = (patch: Partial<StatsData>) => onChange({ ...data, ...patch });
  return (
    <>
      <TextField label="Eyebrow" value={data.eyebrow ?? ""} onChange={(v) => set({ eyebrow: v })} placeholder="Optional" />
      <TextField label="Heading" value={data.heading} onChange={(v) => set({ heading: v })} placeholder="Optional" />
      <AreaField label="Subheading" value={data.subheading} onChange={(v) => set({ subheading: v })} rows={2} />
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Layout"
          value={data.layout ?? "cards"}
          onChange={(v) => set({ layout: v })}
          options={[
            { value: "cards", label: "Cards" },
            { value: "strip", label: "Strip" },
            { value: "split", label: "Split" },
            { value: "minimal", label: "Minimal" },
            { value: "inline", label: "Inline" },
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
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Columns"
          value={String(data.columns ?? 4)}
          onChange={(v) => {
            const n = Number(v);
            set({ columns: n === 2 ? 2 : n === 3 ? 3 : 4 });
          }}
          options={[
            { value: "2", label: "2 columns" },
            { value: "3", label: "3 columns" },
            { value: "4", label: "4 columns" },
          ]}
        />
        <ChoiceField
          label="Alignment"
          value={data.align ?? "center"}
          onChange={(v) => set({ align: v })}
          options={[
            { value: "center", label: "Center" },
            { value: "left", label: "Left" },
          ]}
        />
      </div>
      <Repeatable
        label="Stats"
        items={data.items}
        onChange={(items) => set({ items })}
        addLabel="Add stat"
        makeNew={() => ({
          icon: "",
          value: "100+",
          label: "New metric",
          description: "",
          trend: "",
          highlighted: false,
        })}
        renderItem={(item, patch) => (
          <>
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Icon" value={item.icon ?? ""} onChange={(v) => patch({ ...item, icon: v })} placeholder="Optional" />
              <TextField label="Value" value={item.value} onChange={(v) => patch({ ...item, value: v })} />
            </div>
            <TextField label="Label" value={item.label} onChange={(v) => patch({ ...item, label: v })} />
            <AreaField label="Description" value={item.description ?? ""} onChange={(v) => patch({ ...item, description: v })} rows={2} placeholder="Optional" />
            <TextField label="Trend" value={item.trend ?? ""} onChange={(v) => patch({ ...item, trend: v })} placeholder="Optional" />
            <ToggleField label="Highlight this stat" checked={item.highlighted ?? false} onChange={(v) => patch({ ...item, highlighted: v })} />
          </>
        )}
      />
    </>
  );
}
