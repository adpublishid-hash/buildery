"use client";

import type { BannerData } from "@/lib/blocks/schema";
import {
  AreaField,
  ChoiceField,
  TextField,
  ToggleField,
} from "../fields";
import {
  ALIGN_OPTIONS,
} from "./shared";

export function BannerForm({
  data,
  onChange,
}: {
  data: BannerData;
  onChange: (d: BannerData) => void;
}) {
  const set = (patch: Partial<BannerData>) => onChange({ ...data, ...patch });
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Layout"
          value={data.layout ?? "bar"}
          onChange={(v) => set({ layout: v })}
          options={[
            { value: "bar", label: "Bar" },
            { value: "card", label: "Card" },
            { value: "inline", label: "Inline" },
            { value: "split", label: "Split" },
            { value: "ribbon", label: "Ribbon" },
          ]}
        />
        <ChoiceField
          label="Tone"
          value={data.tone ?? "accent"}
          onChange={(v) => set({ tone: v })}
          options={[
            { value: "accent", label: "Accent" },
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
            { value: "soft", label: "Soft" },
            { value: "success", label: "Success" },
            { value: "warning", label: "Warning" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
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
        <ChoiceField label="Alignment" value={data.align ?? "center"} onChange={(v) => set({ align: v })} options={ALIGN_OPTIONS as never} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Badge" value={data.badge ?? ""} onChange={(v) => set({ badge: v })} placeholder="Optional" />
        <TextField label="Icon" value={data.icon ?? ""} onChange={(v) => set({ icon: v })} placeholder="Optional symbol" />
      </div>
      <TextField label="Eyebrow" value={data.eyebrow ?? ""} onChange={(v) => set({ eyebrow: v })} placeholder="Optional" />
      <TextField label="Heading" value={data.heading ?? ""} onChange={(v) => set({ heading: v })} placeholder="Optional" />
      <AreaField label="Message" value={data.text} onChange={(v) => set({ text: v })} rows={2} />
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Primary label" value={data.linkLabel} onChange={(v) => set({ linkLabel: v })} placeholder="Optional" />
        <TextField label="Primary URL" value={data.linkHref} onChange={(v) => set({ linkHref: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Secondary label" value={data.secondaryLabel ?? ""} onChange={(v) => set({ secondaryLabel: v })} placeholder="Optional" />
        <TextField label="Secondary URL" value={data.secondaryHref ?? "#"} onChange={(v) => set({ secondaryHref: v })} />
      </div>
      <TextField label="Dismiss hint" value={data.dismissLabel ?? ""} onChange={(v) => set({ dismissLabel: v })} placeholder="Optional note" />
      <div className="grid gap-2">
        <ToggleField label="Show icon" checked={data.showIcon ?? true} onChange={(v) => set({ showIcon: v })} />
        <ToggleField label="Compact spacing" checked={data.compact ?? false} onChange={(v) => set({ compact: v })} />
      </div>
    </>
  );
}
