"use client";

import type {
  DividerData,
} from "@/lib/blocks/schema";
import {
  ChoiceField,
  TextField,
  ColorField,
} from "../fields";

export function DividerForm({
  data,
  onChange,
}: {
  data: DividerData;
  onChange: (d: DividerData) => void;
}) {
  const set = (patch: Partial<DividerData>) => onChange({ ...data, ...patch });
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Style"
          value={data.variant}
          onChange={(v) => set({ variant: v })}
          options={[
            { value: "line", label: "Line" },
            { value: "dots", label: "Dots" },
            { value: "space", label: "Empty space" },
            { value: "double", label: "Double" },
            { value: "gradient", label: "Gradient" },
            { value: "label", label: "Label" },
            { value: "icon", label: "Icon" },
            { value: "wave", label: "Wave" },
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
            { value: "bleed", label: "Bleed" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Thickness"
          value={data.thickness ?? "thin"}
          onChange={(v) => set({ thickness: v })}
          options={[
            { value: "hairline", label: "Hairline" },
            { value: "thin", label: "Thin" },
            { value: "medium", label: "Medium" },
            { value: "thick", label: "Thick" },
          ]}
        />
        <ChoiceField
          label="Spacing"
          value={data.spacing ?? "md"}
          onChange={(v) => set({ spacing: v })}
          options={[
            { value: "xs", label: "XS" },
            { value: "sm", label: "Small" },
            { value: "md", label: "Medium" },
            { value: "lg", label: "Large" },
            { value: "xl", label: "XL" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Tone"
          value={data.tone ?? "muted"}
          onChange={(v) => set({ tone: v })}
          options={[
            { value: "muted", label: "Muted" },
            { value: "accent", label: "Accent" },
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
          ]}
        />
        <ChoiceField
          label="Line"
          value={data.lineStyle ?? "solid"}
          onChange={(v) => set({ lineStyle: v })}
          options={[
            { value: "solid", label: "Solid" },
            { value: "dashed", label: "Dashed" },
            { value: "dotted", label: "Dotted" },
          ]}
        />
      </div>
      <ChoiceField
        label="Alignment"
        value={data.align ?? "center"}
        onChange={(v) => set({ align: v })}
        options={[
          { value: "left", label: "Left" },
          { value: "center", label: "Center" },
          { value: "right", label: "Right" },
        ]}
      />
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Label" value={data.label ?? ""} onChange={(v) => set({ label: v })} placeholder="Label variant" />
        <TextField label="Icon" value={data.icon ?? ""} onChange={(v) => set({ icon: v })} placeholder="Icon variant" />
      </div>
      <ColorField label="Custom color" value={data.color ?? ""} onChange={(v) => set({ color: v })} />
    </>
  );
}
