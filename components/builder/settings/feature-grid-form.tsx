"use client";

import type {
  FeatureGridData,
} from "@/lib/blocks/schema";
import {
  AreaField,
  ChoiceField,
  Repeatable,
  TextField,
  ToggleField,
} from "../fields";

export function FeatureGridForm({
  data,
  onChange,
}: {
  data: FeatureGridData;
  onChange: (d: FeatureGridData) => void;
}) {
  const set = (patch: Partial<FeatureGridData>) => onChange({ ...data, ...patch });
  return (
    <>
      <TextField label="Eyebrow" value={data.eyebrow ?? ""} onChange={(v) => set({ eyebrow: v })} placeholder="Optional" />
      <TextField label="Heading" value={data.heading} onChange={(v) => set({ heading: v })} />
      <AreaField label="Subheading" value={data.subheading} onChange={(v) => set({ subheading: v })} rows={2} />
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Layout"
          value={data.layout ?? "cards"}
          onChange={(v) => set({ layout: v })}
          options={[
            { value: "cards", label: "Cards" },
            { value: "icons", label: "Icons" },
            { value: "media", label: "Media" },
            { value: "minimal", label: "Minimal" },
            { value: "list", label: "List" },
          ]}
        />
        <ChoiceField
          label="Card style"
          value={data.cardStyle ?? "outline"}
          onChange={(v) => set({ cardStyle: v })}
          options={[
            { value: "outline", label: "Outline" },
            { value: "soft", label: "Soft" },
            { value: "elevated", label: "Elevated" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Alignment"
          value={data.align ?? "center"}
          onChange={(v) => set({ align: v })}
          options={[
            { value: "center", label: "Center" },
            { value: "left", label: "Left" },
          ]}
        />
        <ChoiceField
          label="Icon style"
          value={data.iconStyle ?? "number"}
          onChange={(v) => set({ iconStyle: v })}
          options={[
            { value: "number", label: "Number" },
            { value: "symbol", label: "Symbol" },
            { value: "accent", label: "Accent" },
          ]}
        />
      </div>
      <ChoiceField
        label="Columns"
        value={String(data.columns)}
        onChange={(v) => {
          const n = Number(v);
          set({ columns: n === 2 ? 2 : n === 4 ? 4 : 3 });
        }}
        options={[
          { value: "2", label: "2 columns" },
          { value: "3", label: "3 columns" },
          { value: "4", label: "4 columns" },
        ]}
      />
      <Repeatable
        label="Features"
        items={data.items}
        onChange={(items) => set({ items })}
        makeNew={() => ({
          eyebrow: "",
          icon: "",
          title: "New feature",
          description: "Describe it.",
          imageUrl: "",
          imageAlt: "",
          linkLabel: "",
          linkHref: "#",
          highlighted: false,
        })}
        addLabel="Add feature"
        renderItem={(item, patch) => (
          <>
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Eyebrow" value={item.eyebrow ?? ""} onChange={(v) => patch({ ...item, eyebrow: v })} placeholder="Optional" />
              <TextField label="Icon" value={item.icon ?? ""} onChange={(v) => patch({ ...item, icon: v })} placeholder="Optional" />
            </div>
            <TextField label="Title" value={item.title} onChange={(v) => patch({ ...item, title: v })} />
            <AreaField label="Description" value={item.description} onChange={(v) => patch({ ...item, description: v })} rows={2} />
            <TextField label="Image URL" value={item.imageUrl ?? ""} onChange={(v) => patch({ ...item, imageUrl: v })} placeholder="Optional" />
            <TextField label="Image alt" value={item.imageAlt ?? ""} onChange={(v) => patch({ ...item, imageAlt: v })} placeholder="Optional" />
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Link label" value={item.linkLabel ?? ""} onChange={(v) => patch({ ...item, linkLabel: v })} placeholder="Optional" />
              <TextField label="Link" value={item.linkHref ?? "#"} onChange={(v) => patch({ ...item, linkHref: v })} />
            </div>
            <ToggleField label="Highlight this feature" checked={item.highlighted ?? false} onChange={(v) => patch({ ...item, highlighted: v })} />
          </>
        )}
      />
    </>
  );
}
