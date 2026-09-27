"use client";

import type {
  PricingData,
} from "@/lib/blocks/schema";
import {
  AreaField,
  ChoiceField,
  Repeatable,
  TextField,
  ToggleField,
} from "../fields";

export function PricingForm({
  data,
  onChange,
}: {
  data: PricingData;
  onChange: (d: PricingData) => void;
}) {
  const set = (patch: Partial<PricingData>) => onChange({ ...data, ...patch });
  return (
    <>
      <TextField label="Eyebrow" value={data.eyebrow ?? ""} onChange={(v) => set({ eyebrow: v })} placeholder="Optional" />
      <TextField label="Heading" value={data.heading} onChange={(v) => set({ heading: v })} />
      <AreaField label="Subheading" value={data.subheading} onChange={(v) => set({ subheading: v })} rows={2} />
      <TextField label="Billing note" value={data.billingNote ?? ""} onChange={(v) => set({ billingNote: v })} placeholder="Optional" />
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Layout"
          value={data.layout ?? "cards"}
          onChange={(v) => set({ layout: v })}
          options={[
            { value: "cards", label: "Cards" },
            { value: "compact", label: "Compact" },
            { value: "featured", label: "Featured" },
            { value: "minimal", label: "Minimal" },
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
        label="Plans"
        items={data.plans}
        onChange={(plans) => set({ plans })}
        addLabel="Add plan"
        makeNew={() => ({
          badge: "",
          name: "New plan",
          price: "$0",
          period: "/mo",
          description: "",
          features: ["Feature one"],
          excludedFeatures: [],
          note: "",
          highlighted: false,
          ctaLabel: "Choose plan",
          ctaHref: "#",
          secondaryLabel: "",
          secondaryHref: "#",
        })}
        renderItem={(plan, patch) => (
          <>
            <TextField label="Badge" value={plan.badge ?? ""} onChange={(v) => patch({ ...plan, badge: v })} placeholder="Optional" />
            <TextField label="Name" value={plan.name} onChange={(v) => patch({ ...plan, name: v })} />
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Price" value={plan.price} onChange={(v) => patch({ ...plan, price: v })} />
              <TextField label="Period" value={plan.period} onChange={(v) => patch({ ...plan, period: v })} />
            </div>
            <TextField label="Description" value={plan.description} onChange={(v) => patch({ ...plan, description: v })} />
            <TextField label="Note" value={plan.note ?? ""} onChange={(v) => patch({ ...plan, note: v })} placeholder="Optional" />
            <AreaField
              label="Features (one per line)"
              value={plan.features.join("\n")}
              onChange={(v) =>
                patch({
                  ...plan,
                  features: v.split("\n").map((s) => s.trim()).filter(Boolean),
                })
              }
              rows={4}
            />
            <AreaField
              label="Excluded features (one per line)"
              value={(plan.excludedFeatures ?? []).join("\n")}
              onChange={(v) =>
                patch({
                  ...plan,
                  excludedFeatures: v.split("\n").map((s) => s.trim()).filter(Boolean),
                })
              }
              rows={3}
            />
            <TextField label="Button label" value={plan.ctaLabel} onChange={(v) => patch({ ...plan, ctaLabel: v })} />
            <TextField label="Button link" value={plan.ctaHref} onChange={(v) => patch({ ...plan, ctaHref: v })} />
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Secondary button" value={plan.secondaryLabel ?? ""} onChange={(v) => patch({ ...plan, secondaryLabel: v })} placeholder="Optional" />
              <TextField label="Secondary link" value={plan.secondaryHref ?? "#"} onChange={(v) => patch({ ...plan, secondaryHref: v })} />
            </div>
            <ToggleField label="Highlight this plan" checked={plan.highlighted} onChange={(v) => patch({ ...plan, highlighted: v })} />
          </>
        )}
      />
    </>
  );
}
