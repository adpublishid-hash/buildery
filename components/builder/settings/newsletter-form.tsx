"use client";

import type {
  NewsletterData,
} from "@/lib/blocks/schema";
import {
  AreaField,
  ChoiceField,
  TextField,
  ToggleField,
} from "../fields";
import {
  ALIGN_OPTIONS,
} from "./shared";

export function NewsletterForm({
  data,
  onChange,
}: {
  data: NewsletterData;
  onChange: (d: NewsletterData) => void;
}) {
  const set = (patch: Partial<NewsletterData>) => onChange({ ...data, ...patch });
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
            { value: "minimal", label: "Minimal" },
            { value: "inline", label: "Inline" },
          ]}
        />
        <ChoiceField
          label="Tone"
          value={data.tone ?? "soft"}
          onChange={(v) => set({ tone: v })}
          options={[
            { value: "soft", label: "Soft" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
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
          label="Fields"
          value={data.fields ?? "email"}
          onChange={(v) => set({ fields: v })}
          options={[
            { value: "email", label: "Email only" },
            { value: "name-email", label: "Name + email" },
          ]}
        />
      </div>
      <TextField label="Eyebrow" value={data.eyebrow ?? ""} onChange={(v) => set({ eyebrow: v })} placeholder="Optional" />
      <TextField label="Heading" value={data.heading} onChange={(v) => set({ heading: v })} />
      <AreaField label="Description" value={data.description} onChange={(v) => set({ description: v })} rows={3} />
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Email placeholder" value={data.placeholder} onChange={(v) => set({ placeholder: v })} />
        <TextField label="Name placeholder" value={data.namePlaceholder ?? ""} onChange={(v) => set({ namePlaceholder: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Button label" value={data.buttonLabel} onChange={(v) => set({ buttonLabel: v })} />
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
      <TextField label="Trust note" value={data.note ?? ""} onChange={(v) => set({ note: v })} placeholder="No spam. Unsubscribe anytime." />
      <TextField label="Success message" value={data.successMessage ?? ""} onChange={(v) => set({ successMessage: v })} />
      <AreaField label="Privacy text" value={data.privacyText ?? ""} onChange={(v) => set({ privacyText: v })} rows={2} placeholder="Optional" />
      <ToggleField label="Require consent" checked={data.showConsent ?? false} onChange={(v) => set({ showConsent: v })} />
      {data.showConsent ? (
        <AreaField label="Consent label" value={data.consentLabel ?? ""} onChange={(v) => set({ consentLabel: v })} rows={2} />
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Secondary label" value={data.secondaryLabel ?? ""} onChange={(v) => set({ secondaryLabel: v })} placeholder="Optional" />
        <TextField label="Secondary link" value={data.secondaryHref ?? "#"} onChange={(v) => set({ secondaryHref: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Image URL" value={data.imageUrl ?? ""} onChange={(v) => set({ imageUrl: v })} placeholder="Split layout only" />
        <TextField label="Image alt" value={data.imageAlt ?? ""} onChange={(v) => set({ imageAlt: v })} placeholder="Optional" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Provider"
          value={data.provider ?? "internal"}
          onChange={(v) => set({ provider: v })}
          options={[
            { value: "internal", label: "Internal" },
            { value: "mailchimp", label: "Mailchimp" },
            { value: "convertkit", label: "ConvertKit" },
            { value: "custom", label: "Custom" },
          ]}
        />
        <ChoiceField label="Alignment" value={data.align ?? "center"} onChange={(v) => set({ align: v })} options={ALIGN_OPTIONS as never} />
      </div>
      <TextField label="Form action URL" value={data.formAction ?? ""} onChange={(v) => set({ formAction: v })} placeholder="Optional external endpoint" />
      <ToggleField label="Compact spacing" checked={data.compact ?? false} onChange={(v) => set({ compact: v })} />
    </>
  );
}
