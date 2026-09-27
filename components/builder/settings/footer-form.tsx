"use client";

import type {
  FooterData,
} from "@/lib/blocks/schema";
import {
  AreaField,
  ChoiceField,
  TextField,
  ToggleField,
} from "../fields";
import {
  NavItemsField,
} from "./shared";
import { SiteWideToggle } from "./site-wide-toggle";

export function FooterForm({
  data,
  onChange,
}: {
  data: FooterData;
  onChange: (d: FooterData) => void;
}) {
  const set = (patch: Partial<FooterData>) => onChange({ ...data, ...patch });
  return (
    <>
      <SiteWideToggle part="footer" data={data} onChange={onChange} />
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Layout"
          value={data.layout ?? "columns"}
          onChange={(v) => set({ layout: v })}
          options={[
            { value: "simple", label: "Sederhana" },
            { value: "columns", label: "Kolom" },
            { value: "cta", label: "CTA + Kolom" },
            { value: "centered", label: "Terpusat" },
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
            { value: "accent", label: "Accent" },
          ]}
        />
      </div>
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
      <TextField label="Brand" value={data.brand} onChange={(v) => set({ brand: v })} />
      <AreaField label="Description" value={data.description} onChange={(v) => set({ description: v })} />
      <TextField label="Copyright" value={data.copyright} onChange={(v) => set({ copyright: v })} />
      <div className="grid grid-cols-2 gap-2">
        <ToggleField label="Show brand" checked={data.showBrand} onChange={(v) => set({ showBrand: v })} />
        <ToggleField label="Show social" checked={data.showSocial} onChange={(v) => set({ showSocial: v })} />
        <ToggleField label="Copyright" checked={data.showCopyright} onChange={(v) => set({ showCopyright: v })} />
      </div>
      <TextField label="CTA heading" value={data.ctaHeading} onChange={(v) => set({ ctaHeading: v })} />
      <AreaField label="CTA description" value={data.ctaDescription} onChange={(v) => set({ ctaDescription: v })} />
      <div className="grid grid-cols-2 gap-2">
        <TextField label="CTA label" value={data.ctaLabel} onChange={(v) => set({ ctaLabel: v })} />
        <TextField label="CTA href" value={data.ctaHref} onChange={(v) => set({ ctaHref: v })} />
      </div>
      <NavItemsField
        label="Footer links"
        items={data.navItems}
        onChange={(navItems) => set({ navItems })}
      />
      <NavItemsField
        label="Social links"
        items={data.socialItems}
        onChange={(socialItems) => set({ socialItems })}
      />
    </>
  );
}
