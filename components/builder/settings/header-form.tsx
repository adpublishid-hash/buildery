"use client";

import type {
  HeaderData,
} from "@/lib/blocks/schema";
import {
  ChoiceField,
  TextField,
  ToggleField,
} from "../fields";
import { ImageUrlUpload } from "../image-url-upload";
import {
  NavItemsField,
} from "./shared";
import { SiteWideToggle } from "./site-wide-toggle";

export function HeaderForm({
  data,
  onChange,
}: {
  data: HeaderData;
  onChange: (d: HeaderData) => void;
}) {
  const set = (patch: Partial<HeaderData>) => onChange({ ...data, ...patch });
  return (
    <>
      <SiteWideToggle part="header" data={data} onChange={onChange} />
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Layout"
          value={data.layout ?? "left"}
          onChange={(v) => set({ layout: v })}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Center" },
            { value: "split", label: "Split" },
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
            { value: "transparent", label: "Transparent" },
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
          label="Button"
          value={data.buttonStyle ?? "solid"}
          onChange={(v) => set({ buttonStyle: v })}
          options={[
            { value: "solid", label: "Solid" },
            { value: "soft", label: "Soft" },
            { value: "outline", label: "Outline" },
          ]}
        />
      </div>
      <TextField label="Logo text" value={data.logoText} onChange={(v) => set({ logoText: v })} />
      <ImageUrlUpload
        label="Logo image"
        value={data.logoUrl}
        onChange={(v) => set({ logoUrl: v })}
        placeholder="Upload logo atau paste URL"
      />
      <TextField label="Tagline" value={data.tagline} onChange={(v) => set({ tagline: v })} />
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Primary label" value={data.primaryLabel} onChange={(v) => set({ primaryLabel: v })} />
        <TextField label="Primary href" value={data.primaryHref} onChange={(v) => set({ primaryHref: v })} />
        <TextField label="Secondary label" value={data.secondaryLabel} onChange={(v) => set({ secondaryLabel: v })} />
        <TextField label="Secondary href" value={data.secondaryHref} onChange={(v) => set({ secondaryHref: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ToggleField label="Show logo" checked={data.showLogo} onChange={(v) => set({ showLogo: v })} />
        <ToggleField label="Show nav" checked={data.showNav} onChange={(v) => set({ showNav: v })} />
        <ToggleField label="Show CTA" checked={data.showCta} onChange={(v) => set({ showCta: v })} />
        <ToggleField label="Sticky" checked={data.sticky} onChange={(v) => set({ sticky: v })} />
        <ToggleField
          label="Hamburger di mobile"
          checked={data.mobileMenu ?? true}
          onChange={(v) => set({ mobileMenu: v })}
        />
      </div>
      <NavItemsField
        label="Navigation"
        items={data.navItems}
        onChange={(navItems) => set({ navItems })}
      />
    </>
  );
}
