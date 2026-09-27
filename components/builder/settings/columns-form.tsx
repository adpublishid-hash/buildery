"use client";

import type {
  ColumnsData,
} from "@/lib/blocks/schema";
import {
  AreaField,
  ChoiceField,
  Repeatable,
  TextField,
  ToggleField,
} from "../fields";
import { RichTextEditor } from "../rich-text-editor";
import {
  ALIGN_OPTIONS,
} from "./shared";

export function ColumnsForm({
  data,
  onChange,
}: {
  data: ColumnsData;
  onChange: (d: ColumnsData) => void;
}) {
  const set = (patch: Partial<ColumnsData>) => onChange({ ...data, ...patch });
  const columnCount = data.columns;
  const items = data.items.length >= columnCount
    ? data.items
    : [
        ...data.items,
        ...Array.from({ length: columnCount - data.items.length }, (_, index) => ({
          eyebrow: "",
          icon: "",
          imageUrl: "",
          imageAlt: "",
          heading: `Column ${data.items.length + index + 1}`,
          body: "<p>Add supporting copy for this column.</p>",
          meta: "",
          buttonLabel: "",
          buttonHref: "#",
          highlighted: false,
        })),
      ];
  return (
    <>
      <TextField label="Heading" value={data.heading} onChange={(v) => set({ heading: v })} />
      <AreaField label="Subheading" value={data.subheading} onChange={(v) => set({ subheading: v })} rows={2} />
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Columns"
          value={String(data.columns)}
          onChange={(v) => {
            const n = Number(v);
            const next = n === 4 ? 4 : n === 3 ? 3 : 2;
            set({ columns: next, items: items.slice(0, next) });
          }}
          options={[
            { value: "2", label: "2 columns" },
            { value: "3", label: "3 columns" },
            { value: "4", label: "4 columns" },
          ]}
        />
        <ChoiceField
          label="Gap"
          value={data.gap}
          onChange={(v) => set({ gap: v })}
          options={[
            { value: "sm", label: "Small" },
            { value: "md", label: "Medium" },
            { value: "lg", label: "Large" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Layout"
          value={data.layout ?? "cards"}
          onChange={(v) => set({ layout: v })}
          options={[
            { value: "cards", label: "Cards" },
            { value: "plain", label: "Plain" },
            { value: "media", label: "Media cards" },
            { value: "numbered", label: "Numbered" },
            { value: "timeline", label: "Timeline" },
          ]}
        />
        <ChoiceField
          label="Card style"
          value={data.cardStyle ?? "outline"}
          onChange={(v) => set({ cardStyle: v })}
          options={[
            { value: "outline", label: "Outline" },
            { value: "soft", label: "Soft" },
            { value: "elevated", label: "Elevated" },
          ]}
        />
      </div>
      <ChoiceField
        label="Vertical alignment"
        value={data.verticalAlign ?? "stretch"}
        onChange={(v) => set({ verticalAlign: v })}
        options={[
          { value: "stretch", label: "Stretch" },
          { value: "top", label: "Top" },
          { value: "center", label: "Center" },
        ]}
      />
      <ChoiceField label="Alignment" value={data.align} onChange={(v) => set({ align: v })} options={ALIGN_OPTIONS as never} />
      <Repeatable
        label="Columns"
        items={items.slice(0, columnCount)}
        onChange={(next) => set({ items: next.slice(0, columnCount) })}
        min={columnCount}
        addLabel="Add column"
        makeNew={() => ({
          eyebrow: "",
          icon: "",
          imageUrl: "",
          imageAlt: "",
          heading: "Column title",
          body: "<p>Use this column to explain a feature, benefit, or offer.</p>",
          meta: "",
          buttonLabel: "",
          buttonHref: "#",
          highlighted: false,
        })}
        renderItem={(item, patch) => (
          <>
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Eyebrow" value={item.eyebrow ?? ""} onChange={(v) => patch({ ...item, eyebrow: v })} placeholder="Optional" />
              <TextField label="Icon" value={item.icon ?? ""} onChange={(v) => patch({ ...item, icon: v })} placeholder="Optional" />
            </div>
            <TextField label="Heading" value={item.heading} onChange={(v) => patch({ ...item, heading: v })} />
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Body
              </p>
              <RichTextEditor value={item.body} onChange={(v) => patch({ ...item, body: v })} />
            </div>
            <TextField label="Image URL" value={item.imageUrl ?? ""} onChange={(v) => patch({ ...item, imageUrl: v })} placeholder="Optional" />
            <TextField label="Image alt" value={item.imageAlt ?? ""} onChange={(v) => patch({ ...item, imageAlt: v })} placeholder="Optional" />
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Meta badge" value={item.meta ?? ""} onChange={(v) => patch({ ...item, meta: v })} placeholder="Optional" />
              <TextField label="Button" value={item.buttonLabel} onChange={(v) => patch({ ...item, buttonLabel: v })} placeholder="Optional" />
            </div>
            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
              <TextField label="Link" value={item.buttonHref} onChange={(v) => patch({ ...item, buttonHref: v })} />
              <ToggleField label="Highlight" checked={item.highlighted ?? false} onChange={(v) => patch({ ...item, highlighted: v })} />
            </div>
          </>
        )}
      />
    </>
  );
}
