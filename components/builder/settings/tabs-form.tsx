"use client";

import type { TabItem, TabsData } from "@/lib/blocks/schema";
import {
  AreaField,
  ChoiceField,
  Repeatable,
  TextField,
} from "../fields";
import { ImageUrlUpload } from "../image-url-upload";
import { ALIGN_OPTIONS } from "./shared";

/** Batas yang sama dengan skema: lebih dari ini, tab sulit dipindai di ponsel. */
const MAX_TABS = 8;

export function TabsForm({
  data,
  onChange,
}: {
  data: TabsData;
  onChange: (d: TabsData) => void;
}) {
  const set = (patch: Partial<TabsData>) => onChange({ ...data, ...patch });
  return (
    <>
      <TextField label="Eyebrow" value={data.eyebrow} onChange={(v) => set({ eyebrow: v })} />
      <TextField label="Judul" value={data.heading} onChange={(v) => set({ heading: v })} />
      <AreaField
        label="Subjudul"
        value={data.subheading}
        onChange={(v) => set({ subheading: v })}
        rows={2}
      />
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Gaya tab"
          value={data.variant}
          onChange={(v) => set({ variant: v })}
          options={[
            { value: "pills", label: "Pil" },
            { value: "underline", label: "Garis bawah" },
            { value: "boxed", label: "Kotak" },
          ]}
        />
        <ChoiceField
          label="Perataan"
          value={data.align}
          onChange={(v) => set({ align: v })}
          options={ALIGN_OPTIONS as never}
        />
      </div>
      <Repeatable<TabItem>
        label="Tab"
        items={data.tabs}
        onChange={(tabs) => set({ tabs: tabs.slice(0, MAX_TABS) })}
        addLabel={data.tabs.length >= MAX_TABS ? `Maksimal ${MAX_TABS} tab` : "Tambah tab"}
        makeNew={() => ({
          label: `Tab ${data.tabs.length + 1}`,
          heading: "",
          body: "",
          imageUrl: "",
          imageAlt: "",
          ctaLabel: "",
          ctaHref: "#",
        })}
        renderItem={(tab, patch) => (
          <>
            <TextField label="Label" value={tab.label} onChange={(v) => patch({ ...tab, label: v })} />
            <TextField label="Judul isi" value={tab.heading} onChange={(v) => patch({ ...tab, heading: v })} />
            <AreaField label="Isi" value={tab.body} onChange={(v) => patch({ ...tab, body: v })} rows={4} />
            <ImageUrlUpload
              label="Gambar (opsional)"
              value={tab.imageUrl}
              onChange={(v) => patch({ ...tab, imageUrl: v })}
            />
            {tab.imageUrl ? (
              <TextField
                label="Alt text gambar"
                value={tab.imageAlt}
                onChange={(v) => patch({ ...tab, imageAlt: v })}
              />
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Label tombol" value={tab.ctaLabel} onChange={(v) => patch({ ...tab, ctaLabel: v })} />
              <TextField label="Tautan tombol" value={tab.ctaHref} onChange={(v) => patch({ ...tab, ctaHref: v })} />
            </div>
          </>
        )}
      />
    </>
  );
}
