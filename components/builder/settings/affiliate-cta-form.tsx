"use client";

import type {
  AffiliateCtaData,
} from "@/lib/blocks/schema";
import {
  AreaField,
  ChoiceField,
  Repeatable,
  TextField,
  ToggleField,
} from "../fields";

export function AffiliateCtaForm({
  data,
  onChange,
}: {
  data: AffiliateCtaData;
  onChange: (d: AffiliateCtaData) => void;
}) {
  const set = (patch: Partial<AffiliateCtaData>) => onChange({ ...data, ...patch });
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Layout"
          value={data.layout ?? "card"}
          onChange={(v) => set({ layout: v })}
          options={[
            { value: "card", label: "Card" },
            { value: "split", label: "Split" },
            { value: "banner", label: "Banner" },
            { value: "stacked", label: "Stacked" },
          ]}
        />
        <ChoiceField
          label="Tone"
          value={data.tone ?? "dark"}
          onChange={(v) => set({ tone: v })}
          options={[
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
            { value: "soft", label: "Soft" },
            { value: "accent", label: "Accent" },
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
          ]}
        />
        <ChoiceField
          label="Button style"
          value={data.buttonStyle ?? "solid"}
          onChange={(v) => set({ buttonStyle: v })}
          options={[
            { value: "solid", label: "Solid" },
            { value: "soft", label: "Soft" },
            { value: "outline", label: "Outline" },
          ]}
        />
      </div>
      <TextField label="Eyebrow" value={data.eyebrow ?? ""} onChange={(v) => set({ eyebrow: v })} />
      <TextField label="Heading" value={data.heading} onChange={(v) => set({ heading: v })} />
      <AreaField label="Description" value={data.description} onChange={(v) => set({ description: v })} rows={3} />
      <TextField label="Commission label" value={data.commission} onChange={(v) => set({ commission: v })} />
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Payout label" value={data.payoutLabel ?? ""} onChange={(v) => set({ payoutLabel: v })} />
        <TextField label="Cookie label" value={data.cookieLabel ?? ""} onChange={(v) => set({ cookieLabel: v })} />
      </div>
      <TextField label="Proof text" value={data.proofText ?? ""} onChange={(v) => set({ proofText: v })} />
      <TextField label="Image URL" value={data.imageUrl ?? ""} onChange={(v) => set({ imageUrl: v })} placeholder="Optional" />
      <TextField label="Primary button" value={data.primaryLabel} onChange={(v) => set({ primaryLabel: v })} />
      <TextField label="Primary link" value={data.primaryHref} onChange={(v) => set({ primaryHref: v })} />
      <TextField label="Secondary button" value={data.secondaryLabel} onChange={(v) => set({ secondaryLabel: v })} />
      <TextField label="Secondary link" value={data.secondaryHref} onChange={(v) => set({ secondaryHref: v })} />
      <div className="grid grid-cols-2 gap-2">
        <ToggleField label="Stats" checked={data.showStats ?? true} onChange={(v) => set({ showStats: v })} />
        <ToggleField label="Benefits" checked={data.showBenefits ?? true} onChange={(v) => set({ showBenefits: v })} />
        <ToggleField label="Image" checked={data.showImage ?? false} onChange={(v) => set({ showImage: v })} />
        <ToggleField label="Compact" checked={data.compact ?? false} onChange={(v) => set({ compact: v })} />
      </div>
      <Repeatable
        label="Benefits"
        items={data.benefits ?? []}
        onChange={(benefits) => set({ benefits })}
        addLabel="Add benefit"
        makeNew={() => "New affiliate benefit"}
        renderItem={(benefit, patch) => (
          <TextField label="Benefit" value={benefit} onChange={patch} />
        )}
      />
    </>
  );
}

