"use client";

import type {
  CollectionData,
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

export function CollectionForm({
  data,
  onChange,
}: {
  data: CollectionData;
  onChange: (d: CollectionData) => void;
}) {
  const set = (patch: Partial<CollectionData>) => onChange({ ...data, ...patch });
  const source = data.source ?? "auto";
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Layout"
          value={data.layout ?? "grid"}
          onChange={(v) => set({ layout: v })}
          options={[
            { value: "grid", label: "Grid" },
            { value: "featured", label: "Featured" },
            { value: "compact", label: "Compact" },
            { value: "carousel", label: "Carousel" },
            { value: "split", label: "Split" },
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
            { value: "accent", label: "Accent" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Width"
          value={data.width ?? "wide"}
          onChange={(v) => set({ width: v })}
          options={[
            { value: "narrow", label: "Narrow" },
            { value: "wide", label: "Wide" },
            { value: "full", label: "Full" },
          ]}
        />
        <ChoiceField
          label="Alignment"
          value={data.align ?? "left"}
          onChange={(v) => set({ align: v })}
          options={ALIGN_OPTIONS as never}
        />
      </div>
      <TextField label="Eyebrow" value={data.eyebrow ?? ""} onChange={(v) => set({ eyebrow: v })} placeholder="Optional" />
      <TextField label="Heading" value={data.heading} onChange={(v) => set({ heading: v })} />
      <AreaField label="Subheading" value={data.subheading} onChange={(v) => set({ subheading: v })} rows={2} />
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Button label" value={data.buttonLabel} onChange={(v) => set({ buttonLabel: v })} />
        <TextField label="Button link" value={data.buttonHref} onChange={(v) => set({ buttonHref: v })} />
      </div>
      <TextField label="Card CTA label" value={data.ctaLabel ?? ""} onChange={(v) => set({ ctaLabel: v })} placeholder="Optional" />
      <ChoiceField
        label="Button style"
        value={data.buttonStyle ?? "outline"}
        onChange={(v) => set({ buttonStyle: v })}
        options={[
          { value: "solid", label: "Solid" },
          { value: "soft", label: "Soft" },
          { value: "outline", label: "Outline" },
        ]}
      />
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Source"
          value={source}
          onChange={(v) => set({ source: v })}
          options={[
            { value: "auto", label: "Auto from workspace" },
            { value: "manual", label: "Manual items" },
          ]}
        />
        <ChoiceField
          label="Limit"
          value={String(data.limit ?? 6)}
          onChange={(v) => set({ limit: Number(v) })}
          options={[
            { value: "3", label: "3 items" },
            { value: "6", label: "6 items" },
            { value: "9", label: "9 items" },
            { value: "12", label: "12 items" },
          ]}
        />
      </div>
      {source === "auto" ? (
        <div className="grid grid-cols-2 gap-2">
          <ChoiceField
            label="Urutkan"
            value={data.sortBy ?? "newest"}
            onChange={(v) => set({ sortBy: v })}
            options={[
              { value: "newest", label: "Terbaru" },
              { value: "oldest", label: "Terlama" },
              { value: "name", label: "Alfabetis" },
            ]}
          />
          <TextField
            label="Filter kategori (slug)"
            value={data.categorySlug ?? ""}
            onChange={(v) => set({ categorySlug: v })}
            placeholder="kosongkan = semua"
          />
        </div>
      ) : null}
      <ChoiceField
        label="Columns"
        value={String(data.columns)}
        onChange={(v) => {
          const n = Number(v);
          set({ columns: n === 2 ? 2 : n === 4 ? 4 : 3 });
        }}
        options={[
          { value: "2", label: "2 columns" },
          { value: "3", label: "3 columns" },
          { value: "4", label: "4 columns" },
        ]}
      />
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Gap"
          value={data.gap ?? "normal"}
          onChange={(v) => set({ gap: v })}
          options={[
            { value: "tight", label: "Tight" },
            { value: "normal", label: "Normal" },
            { value: "loose", label: "Loose" },
          ]}
        />
        <ChoiceField
          label="Card"
          value={data.cardStyle ?? "border"}
          onChange={(v) => set({ cardStyle: v })}
          options={[
            { value: "border", label: "Border" },
            { value: "elevated", label: "Elevated" },
            { value: "plain", label: "Plain" },
            { value: "inset", label: "Inset" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Image ratio"
          value={data.imageAspect ?? "landscape"}
          onChange={(v) => set({ imageAspect: v })}
          options={[
            { value: "landscape", label: "Landscape" },
            { value: "square", label: "Square" },
            { value: "portrait", label: "Portrait" },
          ]}
        />
        <ChoiceField
          label="Image fit"
          value={data.imageFit ?? "cover"}
          onChange={(v) => set({ imageFit: v })}
          options={[
            { value: "cover", label: "Cover" },
            { value: "contain", label: "Contain" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ToggleField label="Images" checked={data.showImages ?? true} onChange={(v) => set({ showImages: v })} />
        <ToggleField label="Highlight first" checked={data.highlightFirst ?? false} onChange={(v) => set({ highlightFirst: v })} />
        <ToggleField label="Badges" checked={data.showBadge ?? true} onChange={(v) => set({ showBadge: v })} />
        <ToggleField label="Meta" checked={data.showMeta ?? true} onChange={(v) => set({ showMeta: v })} />
        <ToggleField label="Detail" checked={data.showDetail ?? true} onChange={(v) => set({ showDetail: v })} />
        <ToggleField label="Description" checked={data.showDescription ?? true} onChange={(v) => set({ showDescription: v })} />
        <ToggleField label="Compact cards" checked={data.compact ?? false} onChange={(v) => set({ compact: v })} />
      </div>
      <TextField label="Empty state" value={data.emptyText ?? ""} onChange={(v) => set({ emptyText: v })} />
      {source === "auto" ? (
        <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-3 text-xs leading-5 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
          Block ini akan otomatis menampilkan item aktif terbaru dari workspace saat halaman preview atau publik dibuka.
          Item manual di bawah schema tetap disimpan sebagai fallback jika belum ada data.
        </div>
      ) : (
        <Repeatable
          label="Items"
          items={data.items}
          onChange={(items) => set({ items })}
          addLabel="Add item"
          makeNew={() => ({
            title: "New item",
            description: "Describe this item.",
            href: "#",
            badge: "Featured",
            meta: "",
            detail: "",
            imageUrl: "",
          })}
          renderItem={(item, patch) => (
            <>
              <TextField label="Title" value={item.title} onChange={(v) => patch({ ...item, title: v })} />
              <AreaField label="Description" value={item.description} onChange={(v) => patch({ ...item, description: v })} rows={2} />
              <TextField label="Image URL" value={item.imageUrl} onChange={(v) => patch({ ...item, imageUrl: v })} placeholder="Optional" />
              <TextField label="Link" value={item.href} onChange={(v) => patch({ ...item, href: v })} />
              <div className="grid grid-cols-2 gap-2">
                <TextField label="Badge" value={item.badge} onChange={(v) => patch({ ...item, badge: v })} placeholder="Optional" />
                <TextField label="Meta" value={item.meta} onChange={(v) => patch({ ...item, meta: v })} placeholder="Price/date/level" />
              </div>
              <TextField label="Detail" value={item.detail ?? ""} onChange={(v) => patch({ ...item, detail: v })} placeholder="Modules/lessons/students" />
            </>
          )}
        />
      )}
    </>
  );
}
