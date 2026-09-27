"use client";

import type {
  HeroData,
} from "@/lib/blocks/schema";
import {
  AreaField,
  ChoiceField,
  Repeatable,
  TextField,
  ColorField,
} from "../fields";
import { ImageUrlUpload } from "../image-url-upload";
import {
  ALIGN_OPTIONS,
} from "./shared";

export function HeroForm({
  data,
  onChange,
}: {
  data: HeroData;
  onChange: (d: HeroData) => void;
}) {
  const set = (patch: Partial<HeroData>) => onChange({ ...data, ...patch });
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Layout"
          value={data.layout ?? "centered"}
          onChange={(v) => set({ layout: v })}
          options={[
            { value: "centered", label: "Centered" },
            { value: "split", label: "Split" },
            { value: "media-top", label: "Media top" },
            { value: "background", label: "Background" },
            { value: "card", label: "Card" },
          ]}
        />
        <ChoiceField
          label="Height"
          value={data.height ?? "normal"}
          onChange={(v) => set({ height: v })}
          options={[
            { value: "compact", label: "Compact" },
            { value: "normal", label: "Normal" },
            { value: "full", label: "Full" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Badge" value={data.badge ?? ""} onChange={(v) => set({ badge: v })} placeholder="Optional" />
        <TextField label="Eyebrow" value={data.eyebrow} onChange={(v) => set({ eyebrow: v })} placeholder="Optional" />
      </div>
      <TextField label="Heading" value={data.heading} onChange={(v) => set({ heading: v })} />
      <AreaField label="Subheading" value={data.subheading} onChange={(v) => set({ subheading: v })} rows={3} />
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
          label="Media position"
          value={data.mediaPosition ?? "right"}
          onChange={(v) => set({ mediaPosition: v })}
          options={[
            { value: "right", label: "Right" },
            { value: "left", label: "Left" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Primary button" value={data.primaryLabel} onChange={(v) => set({ primaryLabel: v })} />
        <TextField label="Primary link" value={data.primaryHref} onChange={(v) => set({ primaryHref: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Secondary button" value={data.secondaryLabel} onChange={(v) => set({ secondaryLabel: v })} />
        <TextField label="Secondary link" value={data.secondaryHref} onChange={(v) => set({ secondaryHref: v })} />
      </div>
      {(data.buttonStyle ?? "solid") === "solid" ? (
        <div className="grid grid-cols-2 gap-2">
          <ColorField label="Warna tombol" value={data.buttonColor ?? ""} onChange={(v) => set({ buttonColor: v })} />
          <ColorField label="Warna teks tombol" value={data.buttonTextColor ?? ""} onChange={(v) => set({ buttonTextColor: v })} />
        </div>
      ) : (
        <ColorField label="Warna teks tombol" value={data.buttonTextColor ?? ""} onChange={(v) => set({ buttonTextColor: v })} />
      )}
      <ImageUrlUpload
        label="Media URL"
        value={data.mediaUrl ?? ""}
        onChange={(v) => set({ mediaUrl: v })}
        placeholder="Upload atau paste URL gambar"
      />
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Media alt" value={data.mediaAlt ?? ""} onChange={(v) => set({ mediaAlt: v })} placeholder="Optional" />
        <TextField label="Media caption" value={data.mediaCaption ?? ""} onChange={(v) => set({ mediaCaption: v })} placeholder="Optional" />
      </div>
      <TextField
        label="Video URL (background)"
        value={data.videoUrl ?? ""}
        onChange={(v) => set({ videoUrl: v })}
        placeholder="URL MP4 — untuk layout Background"
      />
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
      <TextField label="Trust text" value={data.trustText ?? ""} onChange={(v) => set({ trustText: v })} placeholder="Example: Trusted by 200+ creators" />
      <Repeatable
        label="Stats"
        items={(data.stats ?? []).slice(0, 3)}
        onChange={(stats) => set({ stats: stats.slice(0, 3) })}
        min={0}
        addLabel="Add stat"
        makeNew={() => ({ value: "100+", label: "Happy customers" })}
        renderItem={(item, patch) => (
          <div className="grid grid-cols-2 gap-2">
            <TextField label="Value" value={item.value} onChange={(v) => patch({ ...item, value: v })} />
            <TextField label="Label" value={item.label} onChange={(v) => patch({ ...item, label: v })} />
          </div>
        )}
      />
      <ChoiceField label="Alignment" value={data.align} onChange={(v) => set({ align: v })} options={ALIGN_OPTIONS as never} />
    </>
  );
}
