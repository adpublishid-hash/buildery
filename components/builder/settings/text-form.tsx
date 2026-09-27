"use client";

import type {
  TextData,
} from "@/lib/blocks/schema";
import {
  AreaField,
  ChoiceField,
  TextField,
} from "../fields";
import { ImageUrlUpload } from "../image-url-upload";
import { RichTextEditor } from "../rich-text-editor";
import {
  ALIGN_OPTIONS,
} from "./shared";

export function TextForm({
  data,
  onChange,
}: {
  data: TextData;
  onChange: (d: TextData) => void;
}) {
  const set = (patch: Partial<TextData>) => onChange({ ...data, ...patch });
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Layout"
          value={data.layout ?? "narrow"}
          onChange={(v) => set({ layout: v })}
          options={[
            { value: "narrow", label: "Narrow" },
            { value: "wide", label: "Wide" },
            { value: "split", label: "Split" },
            { value: "callout", label: "Callout" },
            { value: "quote", label: "Quote" },
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
      <TextField label="Heading" value={data.heading} onChange={(v) => set({ heading: v })} placeholder="Optional" />
      <AreaField label="Subheading" value={data.subheading ?? ""} onChange={(v) => set({ subheading: v })} rows={2} placeholder="Optional" />
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
          Body
        </p>
        <RichTextEditor value={data.body} onChange={(v) => set({ body: v })} />
      </div>
      <TextField label="Attribution" value={data.attribution ?? ""} onChange={(v) => set({ attribution: v })} placeholder="Optional quote/source" />
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Button" value={data.buttonLabel ?? ""} onChange={(v) => set({ buttonLabel: v })} placeholder="Optional" />
        <TextField label="Link" value={data.buttonHref ?? "#"} onChange={(v) => set({ buttonHref: v })} />
      </div>
      <ChoiceField
        label="Gambar inline"
        value={data.imagePosition ?? "none"}
        onChange={(v) => set({ imagePosition: v })}
        options={[
          { value: "none", label: "Tanpa" },
          { value: "top", label: "Atas" },
          { value: "left", label: "Kiri" },
          { value: "right", label: "Kanan" },
        ]}
      />
      {(data.imagePosition ?? "none") !== "none" ? (
        <>
          <ImageUrlUpload
            label="URL gambar"
            value={data.imageUrl ?? ""}
            onChange={(v) => set({ imageUrl: v })}
            placeholder="Upload atau paste URL gambar"
          />
          <TextField label="Alt gambar" value={data.imageAlt ?? ""} onChange={(v) => set({ imageAlt: v })} placeholder="Optional" />
        </>
      ) : null}
      <ChoiceField label="Alignment" value={data.align} onChange={(v) => set({ align: v })} options={ALIGN_OPTIONS as never} />
    </>
  );
}
