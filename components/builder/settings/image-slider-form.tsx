"use client";

import type {
  ImageSliderData,
} from "@/lib/blocks/schema";
import {
  AreaField,
  ChoiceField,
  Repeatable,
  TextField,
  ToggleField,
} from "../fields";
import { ImageUrlUpload } from "../image-url-upload";
import {
  ALIGN_OPTIONS,
} from "./shared";

export function ImageSliderForm({
  data,
  onChange,
}: {
  data: ImageSliderData;
  onChange: (d: ImageSliderData) => void;
}) {
  const set = (patch: Partial<ImageSliderData>) => onChange({ ...data, ...patch });
  return (
    <>
      <TextField label="Eyebrow" value={data.eyebrow ?? ""} onChange={(v) => set({ eyebrow: v })} placeholder="Optional" />
      <TextField label="Heading" value={data.heading ?? ""} onChange={(v) => set({ heading: v })} placeholder="Optional" />
      <AreaField label="Subheading" value={data.subheading ?? ""} onChange={(v) => set({ subheading: v })} rows={2} placeholder="Optional" />
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Aspect"
          value={data.aspectRatio ?? "wide"}
          onChange={(v) => set({ aspectRatio: v })}
          options={[
            { value: "wide", label: "Wide 16:7" },
            { value: "video", label: "Video 16:9" },
            { value: "cinema", label: "Cinema 21:9" },
            { value: "square", label: "Square" },
            { value: "portrait", label: "Portrait" },
            { value: "auto", label: "Auto" },
          ]}
        />
        <ChoiceField
          label="Fit"
          value={data.fit ?? "cover"}
          onChange={(v) => set({ fit: v })}
          options={[
            { value: "cover", label: "Cover" },
            { value: "contain", label: "Contain" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Frame"
          value={data.frame ?? "rounded"}
          onChange={(v) => set({ frame: v })}
          options={[
            { value: "none", label: "None" },
            { value: "rounded", label: "Rounded" },
            { value: "shadow", label: "Shadow" },
          ]}
        />
        <ChoiceField
          label="Auto-play tiap"
          value={String(data.intervalSec ?? 5)}
          onChange={(v) => set({ intervalSec: Number(v) })}
          options={[
            { value: "3", label: "3 detik" },
            { value: "4", label: "4 detik" },
            { value: "5", label: "5 detik" },
            { value: "7", label: "7 detik" },
            { value: "10", label: "10 detik" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ToggleField label="Auto-play" checked={data.autoplay ?? true} onChange={(v) => set({ autoplay: v })} />
        <ToggleField label="Loop" checked={data.loop ?? true} onChange={(v) => set({ loop: v })} />
        <ToggleField label="Panah navigasi" checked={data.showArrows ?? true} onChange={(v) => set({ showArrows: v })} />
        <ToggleField label="Titik indikator" checked={data.showDots ?? true} onChange={(v) => set({ showDots: v })} />
        <ToggleField label="Tampilkan caption" checked={data.showCaption ?? true} onChange={(v) => set({ showCaption: v })} />
      </div>
      <ChoiceField label="Alignment header" value={data.align ?? "center"} onChange={(v) => set({ align: v })} options={ALIGN_OPTIONS as never} />
      <Repeatable
        label="Slides"
        items={data.items}
        onChange={(items) => set({ items })}
        addLabel="Add slide"
        makeNew={() => ({
          url: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97",
          alt: "Slide image",
          caption: "",
          href: "",
        })}
        renderItem={(item, patch) => (
          <>
            <ImageUrlUpload
              label="Image"
              value={item.url}
              onChange={(v) => patch({ ...item, url: v })}
              placeholder="Upload atau paste URL gambar"
            />
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Alt text" value={item.alt} onChange={(v) => patch({ ...item, alt: v })} />
              <TextField label="Link" value={item.href ?? ""} onChange={(v) => patch({ ...item, href: v })} placeholder="Optional" />
            </div>
            <TextField label="Caption" value={item.caption ?? ""} onChange={(v) => patch({ ...item, caption: v })} placeholder="Optional" />
          </>
        )}
      />
    </>
  );
}
