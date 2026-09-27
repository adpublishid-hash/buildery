"use client";

import type {
  FaqData,
} from "@/lib/blocks/schema";
import {
  AreaField,
  ChoiceField,
  Repeatable,
  TextField,
  ToggleField,
} from "../fields";
import {
  ALIGN_OPTIONS,
} from "./shared";

export function FaqForm({
  data,
  onChange,
}: {
  data: FaqData;
  onChange: (d: FaqData) => void;
}) {
  const set = (patch: Partial<FaqData>) => onChange({ ...data, ...patch });
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Layout"
          value={data.layout ?? "single"}
          onChange={(v) => set({ layout: v })}
          options={[
            { value: "single", label: "Single" },
            { value: "two-column", label: "Two column" },
            { value: "split", label: "Split" },
            { value: "cards", label: "Cards" },
            { value: "grid", label: "Grid" },
          ]}
        />
        <ChoiceField
          label="Tone"
          value={data.tone ?? "plain"}
          onChange={(v) => set({ tone: v })}
          options={[
            { value: "plain", label: "Plain" },
            { value: "soft", label: "Soft" },
            { value: "bordered", label: "Bordered" },
            { value: "accent", label: "Accent" },
          ]}
        />
      </div>
      <TextField label="Eyebrow" value={data.eyebrow ?? ""} onChange={(v) => set({ eyebrow: v })} placeholder="Optional" />
      <TextField label="Heading" value={data.heading} onChange={(v) => set({ heading: v })} />
      <AreaField label="Subheading" value={data.subheading} onChange={(v) => set({ subheading: v })} rows={2} />
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Icon"
          value={data.iconStyle ?? "plus"}
          onChange={(v) => set({ iconStyle: v })}
          options={[
            { value: "plus", label: "Plus" },
            { value: "chevron", label: "Chevron" },
            { value: "number", label: "Number" },
            { value: "none", label: "None" },
          ]}
        />
        <ChoiceField
          label="Answer"
          value={data.answerStyle ?? "plain"}
          onChange={(v) => set({ answerStyle: v })}
          options={[
            { value: "plain", label: "Plain text" },
            { value: "rich", label: "HTML" },
          ]}
        />
      </div>
      <ChoiceField label="Alignment" value={data.align ?? "center"} onChange={(v) => set({ align: v })} options={ALIGN_OPTIONS as never} />
      <div className="grid gap-2">
        <ToggleField label="Show categories" checked={data.showCategories ?? false} onChange={(v) => set({ showCategories: v })} />
        <ToggleField label="Allow multiple open" checked={data.allowMultipleOpen ?? true} onChange={(v) => set({ allowMultipleOpen: v })} />
      </div>
      <TextField label="Search placeholder" value={data.searchPlaceholder ?? ""} onChange={(v) => set({ searchPlaceholder: v })} placeholder="Optional visual prompt" />
      <AreaField label="CTA text" value={data.ctaText ?? ""} onChange={(v) => set({ ctaText: v })} rows={2} placeholder="Optional support prompt" />
      <div className="grid grid-cols-2 gap-2">
        <TextField label="CTA label" value={data.ctaLabel ?? ""} onChange={(v) => set({ ctaLabel: v })} placeholder="Optional" />
        <TextField label="CTA link" value={data.ctaHref ?? "#"} onChange={(v) => set({ ctaHref: v })} />
      </div>
      <Repeatable
        label="Questions"
        items={data.items}
        onChange={(items) => set({ items })}
        addLabel="Add question"
        makeNew={() => ({
          question: "New question?",
          answer: "The answer.",
          category: "",
          anchor: "",
          icon: "",
          highlighted: false,
          defaultOpen: false,
        })}
        renderItem={(item, patch) => (
          <>
            <TextField label="Question" value={item.question} onChange={(v) => patch({ ...item, question: v })} />
            <AreaField label="Answer" value={item.answer} onChange={(v) => patch({ ...item, answer: v })} rows={3} />
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Category" value={item.category ?? ""} onChange={(v) => patch({ ...item, category: v })} placeholder="Optional" />
              <TextField label="Anchor" value={item.anchor ?? ""} onChange={(v) => patch({ ...item, anchor: v })} placeholder="Optional" />
            </div>
            <TextField label="Icon" value={item.icon ?? ""} onChange={(v) => patch({ ...item, icon: v })} placeholder="Optional symbol" />
            <div className="grid gap-2">
              <ToggleField label="Open by default" checked={item.defaultOpen ?? false} onChange={(v) => patch({ ...item, defaultOpen: v })} />
              <ToggleField label="Highlight" checked={item.highlighted ?? false} onChange={(v) => patch({ ...item, highlighted: v })} />
            </div>
          </>
        )}
      />
    </>
  );
}
