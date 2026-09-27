"use client";

import type {
  GalleryData,
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

export function GalleryForm({
  data,
  onChange,
}: {
  data: GalleryData;
  onChange: (d: GalleryData) => void;
}) {
  const set = (patch: Partial<GalleryData>) => onChange({ ...data, ...patch });
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Layout"
          value={data.layout ?? "grid"}
          onChange={(v) => set({ layout: v })}
          options={[
            { value: "grid", label: "Grid" },
            { value: "masonry", label: "Masonry" },
            { value: "featured", label: "Featured" },
            { value: "strip", label: "Scroll strip" },
          ]}
        />
        <ChoiceField
          label="Columns"
          value={String(data.columns)}
          onChange={(v) =>
            set({ columns: Number(v) === 2 ? 2 : Number(v) === 4 ? 4 : 3 })
          }
          options={[
            { value: "2", label: "2 columns" },
            { value: "3", label: "3 columns" },
            { value: "4", label: "4 columns" },
          ]}
        />
      </div>
      <TextField label="Eyebrow" value={data.eyebrow ?? ""} onChange={(v) => set({ eyebrow: v })} placeholder="Optional" />
      <TextField label="Heading" value={data.heading} onChange={(v) => set({ heading: v })} placeholder="Optional" />
      <AreaField label="Subheading" value={data.subheading} onChange={(v) => set({ subheading: v })} rows={2} />
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Gap"
          value={data.gap ?? "md"}
          onChange={(v) => set({ gap: v })}
          options={[
            { value: "sm", label: "Small" },
            { value: "md", label: "Medium" },
            { value: "lg", label: "Large" },
          ]}
        />
        <ChoiceField
          label="Aspect"
          value={data.aspectRatio ?? "video"}
          onChange={(v) => set({ aspectRatio: v })}
          options={[
            { value: "auto", label: "Auto" },
            { value: "video", label: "Video" },
            { value: "square", label: "Square" },
            { value: "portrait", label: "Portrait" },
            { value: "wide", label: "Wide" },
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
          ]}
        />
        <ChoiceField
          label="Captions"
          value={data.captionPosition ?? "overlay"}
          onChange={(v) => set({ captionPosition: v })}
          options={[
            { value: "none", label: "Hidden" },
            { value: "below", label: "Below" },
            { value: "overlay", label: "Overlay" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Hover"
          value={data.hoverEffect ?? "zoom"}
          onChange={(v) => set({ hoverEffect: v })}
          options={[
            { value: "none", label: "None" },
            { value: "zoom", label: "Zoom" },
            { value: "lift", label: "Lift" },
          ]}
        />
        <ChoiceField label="Alignment" value={data.align ?? "center"} onChange={(v) => set({ align: v })} options={ALIGN_OPTIONS as never} />
      </div>
      <ToggleField label="Klik untuk perbesar (zoom)" checked={data.lightbox ?? false} onChange={(v) => set({ lightbox: v })} />
      <Repeatable
        label="Images"
        items={data.items}
        onChange={(items) => set({ items })}
        addLabel="Add image"
        makeNew={() => ({
          url: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97",
          alt: "Gallery image",
          title: "",
          caption: "",
          href: "",
          featured: false,
        })}
        renderItem={(item, patch) => (
          <>
            <ImageUrlUpload label="Image URL" value={item.url} onChange={(v) => patch({ ...item, url: v })} placeholder="Upload atau paste URL gambar" />
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Alt text" value={item.alt} onChange={(v) => patch({ ...item, alt: v })} />
              <TextField label="Link" value={item.href ?? ""} onChange={(v) => patch({ ...item, href: v })} placeholder="Optional" />
            </div>
            <TextField label="Title" value={item.title ?? ""} onChange={(v) => patch({ ...item, title: v })} placeholder="Optional" />
            <AreaField label="Caption" value={item.caption ?? ""} onChange={(v) => patch({ ...item, caption: v })} rows={2} placeholder="Optional" />
            <ToggleField label="Feature this image" checked={item.featured ?? false} onChange={(v) => patch({ ...item, featured: v })} />
          </>
        )}
      />
    </>
  );
}
