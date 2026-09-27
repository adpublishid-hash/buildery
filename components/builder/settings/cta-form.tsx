"use client";

import type {
  CtaData,
} from "@/lib/blocks/schema";
import {
  AreaField,
  ChoiceField,
  TextField,
  ColorField,
} from "../fields";
import { ImageUrlUpload } from "../image-url-upload";
import {
  ALIGN_OPTIONS,
} from "./shared";

export function CtaForm({
  data,
  onChange,
}: {
  data: CtaData;
  onChange: (d: CtaData) => void;
}) {
  const set = (patch: Partial<CtaData>) => onChange({ ...data, ...patch });
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
            { value: "background", label: "Background" },
            { value: "minimal", label: "Minimal" },
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
        <TextField label="Badge" value={data.badge ?? ""} onChange={(v) => set({ badge: v })} placeholder="Optional" />
        <TextField label="Eyebrow" value={data.eyebrow ?? ""} onChange={(v) => set({ eyebrow: v })} placeholder="Optional" />
      </div>
      <TextField label="Heading" value={data.heading} onChange={(v) => set({ heading: v })} />
      <AreaField label="Description" value={data.description} onChange={(v) => set({ description: v })} rows={3} />
      <TextField label="Note" value={data.note ?? ""} onChange={(v) => set({ note: v })} placeholder="Optional small text" />
      <div className="grid grid-cols-2 gap-2">
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
        <ChoiceField
          label="Height"
          value={data.height ?? "normal"}
          onChange={(v) => set({ height: v })}
          options={[
            { value: "compact", label: "Compact" },
            { value: "normal", label: "Normal" },
            { value: "large", label: "Large" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Button label" value={data.buttonLabel} onChange={(v) => set({ buttonLabel: v })} />
        <TextField label="Button link" value={data.buttonHref} onChange={(v) => set({ buttonHref: v })} />
      </div>
      {(data.buttonStyle ?? "solid") === "solid" ? (
        <div className="grid grid-cols-2 gap-2">
          <ColorField label="Warna tombol" value={data.buttonColor ?? ""} onChange={(v) => set({ buttonColor: v })} />
          <ColorField label="Warna teks tombol" value={data.buttonTextColor ?? ""} onChange={(v) => set({ buttonTextColor: v })} />
        </div>
      ) : (
        <ColorField label="Warna teks tombol" value={data.buttonTextColor ?? ""} onChange={(v) => set({ buttonTextColor: v })} />
      )}
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Secondary button" value={data.secondaryLabel ?? ""} onChange={(v) => set({ secondaryLabel: v })} placeholder="Optional" />
        <TextField label="Secondary link" value={data.secondaryHref ?? "#"} onChange={(v) => set({ secondaryHref: v })} />
      </div>
      <ImageUrlUpload
        label="Image URL"
        value={data.imageUrl ?? ""}
        onChange={(v) => set({ imageUrl: v })}
        placeholder="Upload atau paste URL gambar"
      />
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Image alt" value={data.imageAlt ?? ""} onChange={(v) => set({ imageAlt: v })} placeholder="Optional" />
        <ChoiceField
          label="Image position"
          value={data.imagePosition ?? "right"}
          onChange={(v) => set({ imagePosition: v })}
          options={[
            { value: "right", label: "Right" },
            { value: "left", label: "Left" },
          ]}
        />
      </div>
      <ChoiceField
        label="Background overlay"
        value={data.overlay ?? "dark"}
        onChange={(v) => set({ overlay: v })}
        options={[
          { value: "dark", label: "Dark" },
          { value: "light", label: "Light" },
          { value: "none", label: "None" },
        ]}
      />
      <ChoiceField label="Alignment" value={data.align} onChange={(v) => set({ align: v })} options={ALIGN_OPTIONS as never} />
    </>
  );
}
