"use client";

import type {
  MarqueeData,
  MarqueeItem,
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

export function MarqueeForm({
  data,
  onChange,
}: {
  data: MarqueeData;
  onChange: (d: MarqueeData) => void;
}) {
  const set = (patch: Partial<MarqueeData>) => onChange({ ...data, ...patch });
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
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
        <ChoiceField
          label="Ukuran teks"
          value={data.size ?? "md"}
          onChange={(v) => set({ size: v })}
          options={[
            { value: "sm", label: "Small" },
            { value: "md", label: "Medium" },
            { value: "lg", label: "Large" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Arah"
          value={data.direction ?? "left"}
          onChange={(v) => set({ direction: v })}
          options={[
            { value: "left", label: "Ke kiri" },
            { value: "right", label: "Ke kanan" },
          ]}
        />
        <ChoiceField
          label="Kecepatan"
          value={data.speed ?? "normal"}
          onChange={(v) => set({ speed: v })}
          options={[
            { value: "slow", label: "Pelan" },
            { value: "normal", label: "Normal" },
            { value: "fast", label: "Cepat" },
          ]}
        />
      </div>
      <ChoiceField
        label="Pemisah antar item"
        value={data.separator ?? "dot"}
        onChange={(v) => set({ separator: v })}
        options={[
          { value: "dot", label: "Titik (•)" },
          { value: "dash", label: "Garis (—)" },
          { value: "none", label: "Tanpa" },
        ]}
      />
      <ToggleField label="Jeda saat hover" checked={data.pauseOnHover ?? true} onChange={(v) => set({ pauseOnHover: v })} />
      <TextField label="Eyebrow" value={data.eyebrow ?? ""} onChange={(v) => set({ eyebrow: v })} placeholder="Optional — di atas marquee" />
      <TextField label="Heading" value={data.heading ?? ""} onChange={(v) => set({ heading: v })} placeholder="Optional" />
      <AreaField label="Subheading" value={data.subheading ?? ""} onChange={(v) => set({ subheading: v })} rows={2} placeholder="Optional" />
      <Repeatable
        label="Item"
        items={data.items}
        onChange={(items) => set({ items })}
        addLabel="Tambah item"
        makeNew={() => ({ text: "Item baru", icon: "", href: "" } as MarqueeItem)}
        renderItem={(item, patch) => (
          <>
            <div className="grid grid-cols-[1fr_80px] gap-2">
              <TextField label="Teks" value={item.text} onChange={(v) => patch({ ...item, text: v })} />
              <TextField label="Ikon" value={item.icon ?? ""} onChange={(v) => patch({ ...item, icon: v })} placeholder="Emoji" />
            </div>
            <TextField label="Link (opsional)" value={item.href ?? ""} onChange={(v) => patch({ ...item, href: v })} placeholder="Optional" />
          </>
        )}
      />
      <ChoiceField label="Alignment header" value={data.align} onChange={(v) => set({ align: v })} options={ALIGN_OPTIONS as never} />
    </>
  );
}
