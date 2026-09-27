"use client";

import type {
  StepsData,
} from "@/lib/blocks/schema";
import {
  AreaField,
  ChoiceField,
  Repeatable,
  TextField,
  ToggleField,
} from "../fields";

export function StepsForm({
  data,
  onChange,
}: {
  data: StepsData;
  onChange: (d: StepsData) => void;
}) {
  const set = (patch: Partial<StepsData>) => onChange({ ...data, ...patch });
  return (
    <>
      <TextField label="Eyebrow" value={data.eyebrow ?? ""} onChange={(v) => set({ eyebrow: v })} placeholder="Optional" />
      <TextField label="Heading" value={data.heading} onChange={(v) => set({ heading: v })} />
      <AreaField label="Subheading" value={data.subheading} onChange={(v) => set({ subheading: v })} rows={2} />
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Layout"
          value={data.layout ?? "horizontal"}
          onChange={(v) => set({ layout: v })}
          options={[
            { value: "horizontal", label: "Horizontal" },
            { value: "vertical", label: "Vertical" },
            { value: "cards", label: "Cards" },
            { value: "timeline", label: "Timeline" },
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
          value={String(data.columns ?? 3)}
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
        <ChoiceField
          label="Marker"
          value={data.markerStyle ?? "number"}
          onChange={(v) => set({ markerStyle: v })}
          options={[
            { value: "number", label: "Number" },
            { value: "icon", label: "Icon" },
            { value: "dot", label: "Dot" },
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
      <Repeatable
        label="Steps"
        items={data.items}
        onChange={(items) => set({ items })}
        addLabel="Add step"
        makeNew={() => ({
          eyebrow: "",
          icon: "",
          title: "New step",
          description: "Describe this step.",
          meta: "",
          linkLabel: "",
          linkHref: "#",
          highlighted: false,
        })}
        renderItem={(item, patch) => (
          <>
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Eyebrow" value={item.eyebrow ?? ""} onChange={(v) => patch({ ...item, eyebrow: v })} placeholder="Optional" />
              <TextField label="Icon" value={item.icon ?? ""} onChange={(v) => patch({ ...item, icon: v })} placeholder="Optional" />
            </div>
            <TextField label="Title" value={item.title} onChange={(v) => patch({ ...item, title: v })} />
            <AreaField label="Description" value={item.description} onChange={(v) => patch({ ...item, description: v })} rows={2} />
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Meta" value={item.meta ?? ""} onChange={(v) => patch({ ...item, meta: v })} placeholder="Optional" />
              <TextField label="Link label" value={item.linkLabel ?? ""} onChange={(v) => patch({ ...item, linkLabel: v })} placeholder="Optional" />
            </div>
            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
              <TextField label="Link" value={item.linkHref ?? "#"} onChange={(v) => patch({ ...item, linkHref: v })} />
              <ToggleField label="Highlight" checked={item.highlighted ?? false} onChange={(v) => patch({ ...item, highlighted: v })} />
            </div>
          </>
        )}
      />
    </>
  );
}
