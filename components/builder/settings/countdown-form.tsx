"use client";

import type {
  CountdownData,
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

export function CountdownForm({
  data,
  onChange,
}: {
  data: CountdownData;
  onChange: (d: CountdownData) => void;
}) {
  const set = (patch: Partial<CountdownData>) => onChange({ ...data, ...patch });
  // <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm"; ISO from new Date() has seconds + Z.
  const localValue = (() => {
    if (!data.targetDate) return "";
    const d = new Date(data.targetDate);
    if (!Number.isFinite(d.getTime())) return "";
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Layout"
          value={data.layout ?? "cards"}
          onChange={(v) => set({ layout: v })}
          options={[
            { value: "cards", label: "Cards" },
            { value: "compact", label: "Compact" },
            { value: "minimal", label: "Minimal" },
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
      <TextField label="Eyebrow" value={data.eyebrow ?? ""} onChange={(v) => set({ eyebrow: v })} placeholder="Optional" />
      <TextField label="Heading" value={data.heading} onChange={(v) => set({ heading: v })} />
      <AreaField label="Subheading" value={data.subheading ?? ""} onChange={(v) => set({ subheading: v })} rows={2} placeholder="Optional" />
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Target date & time</p>
        <input
          type="datetime-local"
          value={localValue}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return set({ targetDate: "" });
            const d = new Date(v);
            set({ targetDate: Number.isFinite(d.getTime()) ? d.toISOString() : "" });
          }}
          className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 outline-none transition focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ToggleField label="Tampilkan label" checked={data.showLabels ?? true} onChange={(v) => set({ showLabels: v })} />
        <ToggleField label="Tampilkan detik" checked={data.showSeconds ?? true} onChange={(v) => set({ showSeconds: v })} />
      </div>
      <div className="grid grid-cols-4 gap-2">
        <TextField label="Label hari" value={data.labelDays} onChange={(v) => set({ labelDays: v })} />
        <TextField label="Label jam" value={data.labelHours} onChange={(v) => set({ labelHours: v })} />
        <TextField label="Label menit" value={data.labelMinutes} onChange={(v) => set({ labelMinutes: v })} />
        <TextField label="Label detik" value={data.labelSeconds} onChange={(v) => set({ labelSeconds: v })} />
      </div>
      <TextField label="Pesan saat habis" value={data.expiredMessage} onChange={(v) => set({ expiredMessage: v })} />
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Tombol CTA" value={data.ctaLabel ?? ""} onChange={(v) => set({ ctaLabel: v })} placeholder="Optional" />
        <TextField label="Link CTA" value={data.ctaHref ?? "#"} onChange={(v) => set({ ctaHref: v })} />
      </div>
      <ChoiceField label="Alignment" value={data.align} onChange={(v) => set({ align: v })} options={ALIGN_OPTIONS as never} />
    </>
  );
}
