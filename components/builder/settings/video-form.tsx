"use client";

import type {
  VideoData,
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

export function VideoForm({
  data,
  onChange,
}: {
  data: VideoData;
  onChange: (d: VideoData) => void;
}) {
  const set = (patch: Partial<VideoData>) => onChange({ ...data, ...patch });
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
            { value: "card", label: "Card" },
            { value: "full", label: "Full" },
          ]}
        />
        <ChoiceField
          label="Width"
          value={data.width ?? "wide"}
          onChange={(v) => set({ width: v })}
          options={[
            { value: "narrow", label: "Narrow" },
            { value: "wide", label: "Wide" },
            { value: "full", label: "Full" },
            { value: "bleed", label: "Bleed" },
          ]}
        />
      </div>
      <TextField label="Eyebrow" value={data.eyebrow ?? ""} onChange={(v) => set({ eyebrow: v })} placeholder="Optional" />
      <TextField label="Heading" value={data.heading} onChange={(v) => set({ heading: v })} placeholder="Optional" />
      <AreaField label="Subheading" value={data.subheading ?? ""} onChange={(v) => set({ subheading: v })} rows={2} placeholder="Optional" />
      <TextField
        label="Video URL"
        value={data.url}
        onChange={(v) => set({ url: v })}
        placeholder="YouTube, Vimeo, embed URL, or .mp4"
        hint="YouTube/Vimeo watch URLs are converted automatically."
      />
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Poster image" value={data.posterUrl ?? ""} onChange={(v) => set({ posterUrl: v })} placeholder="Optional" />
        <TextField label="Poster alt" value={data.posterAlt ?? ""} onChange={(v) => set({ posterAlt: v })} placeholder="Optional" />
      </div>
      <AreaField label="Caption" value={data.caption} onChange={(v) => set({ caption: v })} rows={2} placeholder="Optional" />
      <AreaField label="Transcript" value={data.transcript ?? ""} onChange={(v) => set({ transcript: v })} rows={4} placeholder="Optional accessibility transcript" />
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Button label" value={data.buttonLabel ?? ""} onChange={(v) => set({ buttonLabel: v })} placeholder="Optional" />
        <TextField label="Button link" value={data.buttonHref ?? "#"} onChange={(v) => set({ buttonHref: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Aspect"
          value={data.aspectRatio ?? "video"}
          onChange={(v) => set({ aspectRatio: v })}
          options={[
            { value: "video", label: "Video" },
            { value: "square", label: "Square" },
            { value: "portrait", label: "Portrait" },
            { value: "wide", label: "Wide" },
          ]}
        />
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
      </div>
      <div className="grid grid-cols-2 gap-2">
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
        <ChoiceField
          label="Fit"
          value={data.videoFit ?? "cover"}
          onChange={(v) => set({ videoFit: v })}
          options={[
            { value: "cover", label: "Cover" },
            { value: "contain", label: "Contain" },
          ]}
        />
      </div>
      <ChoiceField label="Alignment" value={data.align ?? "center"} onChange={(v) => set({ align: v })} options={ALIGN_OPTIONS as never} />
      <div className="grid gap-2">
        <ToggleField label="Show controls" checked={data.controls ?? true} onChange={(v) => set({ controls: v })} />
        <ToggleField label="Autoplay" checked={data.autoplay ?? false} onChange={(v) => set({ autoplay: v })} />
        <ToggleField label="Muted" checked={data.muted ?? false} onChange={(v) => set({ muted: v })} />
        <ToggleField label="Loop" checked={data.loop ?? false} onChange={(v) => set({ loop: v })} />
      </div>
    </>
  );
}
