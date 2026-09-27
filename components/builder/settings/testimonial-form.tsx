"use client";

import type {
  TestimonialData,
} from "@/lib/blocks/schema";
import {
  AreaField,
  ChoiceField,
  Repeatable,
  TextField,
  ToggleField,
} from "../fields";

export function TestimonialForm({
  data,
  onChange,
}: {
  data: TestimonialData;
  onChange: (d: TestimonialData) => void;
}) {
  const set = (patch: Partial<TestimonialData>) => onChange({ ...data, ...patch });
  return (
    <>
      <TextField label="Eyebrow" value={data.eyebrow ?? ""} onChange={(v) => set({ eyebrow: v })} placeholder="Optional" />
      <TextField label="Heading" value={data.heading ?? ""} onChange={(v) => set({ heading: v })} placeholder="Optional" />
      <AreaField label="Subheading" value={data.subheading ?? ""} onChange={(v) => set({ subheading: v })} rows={2} placeholder="Optional" />
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Layout"
          value={data.layout ?? "single"}
          onChange={(v) => set({ layout: v })}
          options={[
            { value: "single", label: "Single" },
            { value: "card", label: "Card" },
            { value: "split", label: "Split" },
            { value: "grid", label: "Grid" },
            { value: "scroll", label: "Scroll" },
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
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Columns"
          value={String(data.columns ?? 3)}
          onChange={(v) => set({ columns: Number(v) === 2 ? 2 : 3 })}
          options={[
            { value: "2", label: "2 columns" },
            { value: "3", label: "3 columns" },
          ]}
        />
        <ChoiceField
          label="Alignment"
          value={data.align ?? "center"}
          onChange={(v) => set({ align: v })}
          options={[
            { value: "center", label: "Center" },
            { value: "left", label: "Left" },
          ]}
        />
      </div>
      <ToggleField label="Show quote mark" checked={data.showQuotes ?? true} onChange={(v) => set({ showQuotes: v })} />
      <AreaField label="Quote" value={data.quote} onChange={(v) => set({ quote: v })} rows={4} />
      <TextField label="Author name" value={data.authorName} onChange={(v) => set({ authorName: v })} />
      <TextField label="Author role" value={data.authorRole} onChange={(v) => set({ authorRole: v })} />
      <TextField label="Avatar URL" value={data.avatarUrl} onChange={(v) => set({ avatarUrl: v })} placeholder="Optional" />
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Logo URL" value={data.logoUrl ?? ""} onChange={(v) => set({ logoUrl: v })} placeholder="Optional" />
        <ChoiceField
          label="Rating"
          value={String(data.rating ?? 5)}
          onChange={(v) => set({ rating: Number(v) })}
          options={[
            { value: "0", label: "No rating" },
            { value: "1", label: "1 star" },
            { value: "2", label: "2 stars" },
            { value: "3", label: "3 stars" },
            { value: "4", label: "4 stars" },
            { value: "5", label: "5 stars" },
          ]}
        />
      </div>
      <Repeatable
        label="Testimonials"
        items={data.items ?? []}
        onChange={(items) => set({ items })}
        min={0}
        addLabel="Add testimonial"
        makeNew={() => ({
          quote: "This made our launch faster and easier.",
          authorName: "New customer",
          authorRole: "Founder",
          avatarUrl: "",
          logoUrl: "",
          rating: 5,
          highlighted: false,
        })}
        renderItem={(item, patch) => (
          <>
            <AreaField label="Quote" value={item.quote} onChange={(v) => patch({ ...item, quote: v })} rows={3} />
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Author" value={item.authorName} onChange={(v) => patch({ ...item, authorName: v })} />
              <TextField label="Role" value={item.authorRole} onChange={(v) => patch({ ...item, authorRole: v })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Avatar URL" value={item.avatarUrl} onChange={(v) => patch({ ...item, avatarUrl: v })} placeholder="Optional" />
              <TextField label="Logo URL" value={item.logoUrl ?? ""} onChange={(v) => patch({ ...item, logoUrl: v })} placeholder="Optional" />
            </div>
            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
              <ChoiceField
                label="Rating"
                value={String(item.rating ?? 5)}
                onChange={(v) => patch({ ...item, rating: Number(v) })}
                options={[
                  { value: "0", label: "No rating" },
                  { value: "1", label: "1 star" },
                  { value: "2", label: "2 stars" },
                  { value: "3", label: "3 stars" },
                  { value: "4", label: "4 stars" },
                  { value: "5", label: "5 stars" },
                ]}
              />
              <ToggleField label="Highlight" checked={item.highlighted ?? false} onChange={(v) => patch({ ...item, highlighted: v })} />
            </div>
          </>
        )}
      />
    </>
  );
}
