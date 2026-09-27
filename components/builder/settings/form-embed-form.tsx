"use client";

import type { BuilderFormOption } from "../page-builder";
import type { FormEmbedData } from "@/lib/blocks/schema";
import {
  AreaField,
  ChoiceField,
  TextField,
  ToggleField,
} from "../fields";
import {
  ALIGN_OPTIONS,
} from "./shared";

export function FormEmbedForm({
  data,
  onChange,
  formOptions,
}: {
  data: FormEmbedData;
  onChange: (d: FormEmbedData) => void;
  formOptions: BuilderFormOption[];
}) {
  const set = (patch: Partial<FormEmbedData>) => onChange({ ...data, ...patch });
  const selectedForm = formOptions.find((form) =>
    data.formId ? form.id === data.formId : form.slug === data.formSlug
  );
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
          label="Alignment"
          value={data.align ?? "center"}
          onChange={(v) => set({ align: v })}
          options={ALIGN_OPTIONS as never}
        />
      </div>
      {formOptions.length > 0 ? (
        <ChoiceField
          label="Form"
          value={selectedForm?.id ?? "__none"}
          onChange={(v) => {
            if (v === "__none") return;
            const form = formOptions.find((item) => item.id === v);
            if (!form) return;
            set({ formId: form.id, formSlug: form.slug });
          }}
          options={[
            { value: "__none", label: "Pilih form" },
            ...formOptions.map((form) => ({
              value: form.id,
              label: `${form.title} /${form.slug} (${form.fieldCount} fields${
                form.isOpen ? "" : ", closed"
              })`,
            })),
          ]}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-zinc-200 p-3 text-xs leading-5 text-zinc-500 dark:border-zinc-800">
          Belum ada form di workspace ini. Buat form di menu Forms, lalu kembali
          ke builder.
        </div>
      )}
      <TextField
        label="Form slug"
        value={data.formSlug ?? ""}
        onChange={(v) => set({ formSlug: v.trim(), formId: "" })}
        placeholder="contact"
      />
      <TextField
        label="Form ID"
        value={data.formId ?? ""}
        onChange={(v) => set({ formId: v.trim() })}
        placeholder="Optional, takes priority over slug"
      />
      <div className="grid gap-2">
        <ToggleField
          label="Show block header"
          checked={data.showHeader ?? true}
          onChange={(v) => set({ showHeader: v })}
        />
        <ToggleField
          label="Use title and description from selected form"
          checked={data.useFormCopy ?? true}
          onChange={(v) => set({ useFormCopy: v })}
        />
      </div>
      <TextField
        label="Eyebrow"
        value={data.eyebrow ?? ""}
        onChange={(v) => set({ eyebrow: v })}
        placeholder="Optional"
      />
      <TextField
        label="Heading"
        value={data.heading}
        onChange={(v) => set({ heading: v })}
      />
      <AreaField
        label="Description"
        value={data.description}
        onChange={(v) => set({ description: v })}
        rows={3}
      />
      <TextField
        label="Submit label fallback"
        value={data.submitLabel}
        onChange={(v) => set({ submitLabel: v })}
      />
      <AreaField
        label="Success message fallback"
        value={data.successMessage}
        onChange={(v) => set({ successMessage: v })}
        rows={2}
      />
      <AreaField
        label="Empty state"
        value={data.emptyText}
        onChange={(v) => set({ emptyText: v })}
        rows={2}
      />
      <AreaField
        label="Closed state"
        value={data.closedText}
        onChange={(v) => set({ closedText: v })}
        rows={2}
      />
    </>
  );
}
