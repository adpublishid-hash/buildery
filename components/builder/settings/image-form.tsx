"use client";

import type {
  ImageData,
} from "@/lib/blocks/schema";
import {
  AreaField,
  ChoiceField,
  TextField,
  ToggleField,
} from "../fields";
import { ImageUrlUpload } from "../image-url-upload";

export function ImageForm({
  data,
  onChange,
}: {
  data: ImageData;
  onChange: (d: ImageData) => void;
}) {
  const set = (patch: Partial<ImageData>) => onChange({ ...data, ...patch });
  return (
    <>
      <ImageUrlUpload
        label="Image URL"
        value={data.url}
        onChange={(v) => set({ url: v })}
        placeholder="Upload atau paste URL gambar"
      />
      <TextField label="Alt text" value={data.alt} onChange={(v) => set({ alt: v })} />
      <TextField label="Eyebrow" value={data.eyebrow ?? ""} onChange={(v) => set({ eyebrow: v })} placeholder="Optional" />
      <TextField label="Title" value={data.title ?? ""} onChange={(v) => set({ title: v })} placeholder="Optional" />
      <AreaField label="Description" value={data.description ?? ""} onChange={(v) => set({ description: v })} rows={2} placeholder="Optional" />
      <TextField label="Link" value={data.linkHref ?? ""} onChange={(v) => set({ linkHref: v })} placeholder="Optional" />
      <TextField label="Caption" value={data.caption} onChange={(v) => set({ caption: v })} placeholder="Optional" />
      <ChoiceField
        label="Width"
        value={data.width}
        onChange={(v) => set({ width: v })}
        options={[
          { value: "narrow", label: "Narrow" },
          { value: "wide", label: "Wide" },
          { value: "full", label: "Full" },
          { value: "bleed", label: "Bleed" },
        ]}
      />
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Aspect"
          value={data.aspectRatio ?? "auto"}
          onChange={(v) => set({ aspectRatio: v })}
          options={[
            { value: "auto", label: "Auto" },
            { value: "video", label: "Video" },
            { value: "square", label: "Square" },
            { value: "portrait", label: "Portrait" },
            { value: "wide", label: "Wide" },
          ]}
        />
        <ChoiceField
          label="Fit"
          value={data.objectFit ?? "cover"}
          onChange={(v) => set({ objectFit: v })}
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
            { value: "border", label: "Border" },
            { value: "shadow", label: "Shadow" },
            { value: "browser", label: "Browser" },
          ]}
        />
        <ChoiceField
          label="Caption"
          value={data.captionPosition ?? "below"}
          onChange={(v) => set({ captionPosition: v })}
          options={[
            { value: "below", label: "Below" },
            { value: "overlay", label: "Overlay" },
            { value: "none", label: "Hidden" },
          ]}
        />
      </div>
      <ChoiceField
        label="Alignment"
        value={data.align ?? "center"}
        onChange={(v) => set({ align: v })}
        options={[
          { value: "left", label: "Left" },
          { value: "center", label: "Center" },
          { value: "right", label: "Right" },
        ]}
      />
      <ToggleField label="Rounded corners" checked={data.rounded} onChange={(v) => set({ rounded: v })} />
      <ToggleField label="Klik untuk perbesar (zoom)" checked={data.lightbox ?? false} onChange={(v) => set({ lightbox: v })} />
    </>
  );
}
