"use client";

import type {
  ContactFormData,
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

export function ContactFormForm({
  data,
  onChange,
}: {
  data: ContactFormData;
  onChange: (d: ContactFormData) => void;
}) {
  const set = (patch: Partial<ContactFormData>) => onChange({ ...data, ...patch });
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
            { value: "stacked", label: "Stacked" },
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
          label="Submit"
          value={data.submitMode ?? "disabled"}
          onChange={(v) => set({ submitMode: v })}
          options={[
            { value: "disabled", label: "Preview only" },
            { value: "external", label: "External action" },
            { value: "mailto", label: "Email app" },
          ]}
        />
      </div>
      <TextField label="Eyebrow" value={data.eyebrow ?? ""} onChange={(v) => set({ eyebrow: v })} placeholder="Optional" />
      <TextField label="Heading" value={data.heading} onChange={(v) => set({ heading: v })} />
      <AreaField label="Description" value={data.description} onChange={(v) => set({ description: v })} rows={3} />
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Fields"
          value={
            data.showPhone && data.showCompany
              ? "phone-company"
              : data.showPhone
                ? "phone"
                : data.showCompany
                  ? "company"
                  : "basic"
          }
          onChange={(v) =>
            set({
              showPhone: v === "phone" || v === "phone-company",
              showCompany: v === "company" || v === "phone-company",
            })
          }
          options={[
            { value: "basic", label: "Name + email" },
            { value: "phone", label: "+ phone" },
            { value: "company", label: "+ company" },
            { value: "phone-company", label: "+ both" },
          ]}
        />
        <ChoiceField
          label="Field style"
          value={data.fieldStyle ?? "outline"}
          onChange={(v) => set({ fieldStyle: v })}
          options={[
            { value: "outline", label: "Outline" },
            { value: "filled", label: "Filled" },
            { value: "underline", label: "Underline" },
          ]}
        />
      </div>
      <div className="grid gap-2">
        <ToggleField label="Show subject field" checked={data.showSubject ?? false} onChange={(v) => set({ showSubject: v })} />
        <ToggleField label="Require consent" checked={data.showConsent ?? false} onChange={(v) => set({ showConsent: v })} />
        <ToggleField label="Show contact info" checked={data.showContactInfo ?? true} onChange={(v) => set({ showContactInfo: v })} />
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
      <TextField label="Success message" value={data.successMessage ?? ""} onChange={(v) => set({ successMessage: v })} />
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Form action URL" value={data.formAction ?? ""} onChange={(v) => set({ formAction: v })} placeholder="External mode" />
        <TextField label="Recipient email" value={data.recipientEmail ?? ""} onChange={(v) => set({ recipientEmail: v })} placeholder="Mailto mode" />
      </div>
      <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <p className="mb-3 text-xs font-medium text-zinc-700 dark:text-zinc-300">
          Field labels
        </p>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <TextField label="Name label" value={data.nameLabel ?? "Name"} onChange={(v) => set({ nameLabel: v })} />
            <TextField label="Name placeholder" value={data.namePlaceholder ?? ""} onChange={(v) => set({ namePlaceholder: v })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <TextField label="Email label" value={data.emailLabel ?? "Email"} onChange={(v) => set({ emailLabel: v })} />
            <TextField label="Email placeholder" value={data.emailPlaceholder ?? ""} onChange={(v) => set({ emailPlaceholder: v })} />
          </div>
          {data.showPhone ? (
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Phone label" value={data.phoneLabel ?? "Phone"} onChange={(v) => set({ phoneLabel: v })} />
              <TextField label="Phone placeholder" value={data.phonePlaceholder ?? ""} onChange={(v) => set({ phonePlaceholder: v })} />
            </div>
          ) : null}
          {data.showCompany ? (
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Company label" value={data.companyLabel ?? "Company"} onChange={(v) => set({ companyLabel: v })} />
              <TextField label="Company placeholder" value={data.companyPlaceholder ?? ""} onChange={(v) => set({ companyPlaceholder: v })} />
            </div>
          ) : null}
          {data.showSubject ? (
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Subject label" value={data.subjectLabel ?? "Subject"} onChange={(v) => set({ subjectLabel: v })} />
              <TextField label="Subject placeholder" value={data.subjectPlaceholder ?? ""} onChange={(v) => set({ subjectPlaceholder: v })} />
            </div>
          ) : null}
          <TextField label="Message label" value={data.messageLabel ?? "Message"} onChange={(v) => set({ messageLabel: v })} />
          <AreaField label="Message placeholder" value={data.messagePlaceholder ?? ""} onChange={(v) => set({ messagePlaceholder: v })} rows={2} />
        </div>
      </div>
      {data.showConsent ? (
        <AreaField label="Consent label" value={data.consentLabel ?? ""} onChange={(v) => set({ consentLabel: v })} rows={2} />
      ) : null}
      <AreaField label="Privacy text" value={data.privacyText ?? ""} onChange={(v) => set({ privacyText: v })} rows={2} />
      {data.showContactInfo ? (
        <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="mb-3 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Contact info
          </p>
          <div className="space-y-2">
            <TextField label="Email" value={data.contactEmail ?? ""} onChange={(v) => set({ contactEmail: v })} placeholder="hello@example.com" />
            <TextField label="Phone" value={data.contactPhone ?? ""} onChange={(v) => set({ contactPhone: v })} placeholder="+1 555 000 0000" />
            <AreaField label="Address" value={data.contactAddress ?? ""} onChange={(v) => set({ contactAddress: v })} rows={2} />
            <TextField label="Response time" value={data.responseTime ?? ""} onChange={(v) => set({ responseTime: v })} />
          </div>
        </div>
      ) : null}
      <ChoiceField label="Alignment" value={data.align ?? "center"} onChange={(v) => set({ align: v })} options={ALIGN_OPTIONS as never} />
      <ToggleField label="Compact spacing" checked={data.compact ?? false} onChange={(v) => set({ compact: v })} />
    </>
  );
}
