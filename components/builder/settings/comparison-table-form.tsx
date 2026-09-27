"use client";

import type {
  ComparisonColumn,
  ComparisonRow,
  ComparisonTableData,
} from "@/lib/blocks/schema";
import {
  AreaField,
  ChoiceField,
  Repeatable,
  TextField,
  ToggleField,
} from "../fields";

export function ComparisonTableForm({
  data,
  onChange,
}: {
  data: ComparisonTableData;
  onChange: (d: ComparisonTableData) => void;
}) {
  const set = (patch: Partial<ComparisonTableData>) => onChange({ ...data, ...patch });
  const columnCount = data.columns?.length ?? 0;
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Layout"
          value={data.layout ?? "table"}
          onChange={(v) => set({ layout: v })}
          options={[
            { value: "table", label: "Table" },
            { value: "cards", label: "Cards" },
          ]}
        />
        <ChoiceField
          label="Tone"
          value={data.tone ?? "light"}
          onChange={(v) => set({ tone: v })}
          options={[
            { value: "light", label: "Light" },
            { value: "soft", label: "Soft" },
          ]}
        />
      </div>
      <TextField label="Eyebrow" value={data.eyebrow ?? ""} onChange={(v) => set({ eyebrow: v })} placeholder="Optional" />
      <TextField label="Heading" value={data.heading} onChange={(v) => set({ heading: v })} />
      <AreaField label="Subheading" value={data.subheading ?? ""} onChange={(v) => set({ subheading: v })} rows={2} placeholder="Optional" />
      <ToggleField label="Tampilkan tombol CTA per kolom" checked={data.showCta ?? true} onChange={(v) => set({ showCta: v })} />
      <ChoiceField
        label="Alignment header"
        value={data.align ?? "center"}
        onChange={(v) => set({ align: v })}
        options={[
          { value: "left", label: "Left" },
          { value: "center", label: "Center" },
        ]}
      />

      <Repeatable
        label="Kolom (paket)"
        items={data.columns}
        onChange={(columns) => {
          // Keep each row's `values` length in sync with column count.
          const desired = columns.length;
          const nextRows = (data.rows ?? []).map((row) => {
            const values = [...(row.values ?? [])];
            while (values.length < desired) values.push("✓");
            values.length = desired;
            return { ...row, values };
          });
          set({ columns, rows: nextRows });
        }}
        addLabel="Tambah kolom"
        makeNew={() => ({
          name: "Kolom baru",
          description: "",
          badge: "",
          ctaLabel: "Pilih",
          ctaHref: "#",
          highlighted: false,
        } as ComparisonColumn)}
        renderItem={(item, patch) => (
          <>
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Nama" value={item.name} onChange={(v) => patch({ ...item, name: v })} />
              <TextField label="Badge" value={item.badge ?? ""} onChange={(v) => patch({ ...item, badge: v })} placeholder="Optional" />
            </div>
            <TextField label="Deskripsi" value={item.description ?? ""} onChange={(v) => patch({ ...item, description: v })} placeholder="Optional" />
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Tombol CTA" value={item.ctaLabel ?? ""} onChange={(v) => patch({ ...item, ctaLabel: v })} />
              <TextField label="Link CTA" value={item.ctaHref ?? "#"} onChange={(v) => patch({ ...item, ctaHref: v })} />
            </div>
            <ToggleField label="Highlight kolom ini" checked={item.highlighted ?? false} onChange={(v) => patch({ ...item, highlighted: v })} />
          </>
        )}
      />

      <Repeatable
        label="Baris (fitur)"
        items={data.rows}
        onChange={(rows) => {
          // Pad each new row's values to match column count.
          const synced = rows.map((row) => {
            const values = [...(row.values ?? [])];
            while (values.length < columnCount) values.push("✓");
            values.length = columnCount;
            return { ...row, values };
          });
          set({ rows: synced });
        }}
        addLabel="Tambah baris"
        makeNew={() =>
          ({
            feature: "Fitur baru",
            description: "",
            values: Array.from({ length: columnCount }, () => "✓"),
          }) as ComparisonRow
        }
        renderItem={(item, patch) => (
          <>
            <TextField label="Nama fitur" value={item.feature} onChange={(v) => patch({ ...item, feature: v })} />
            <TextField label="Deskripsi" value={item.description ?? ""} onChange={(v) => patch({ ...item, description: v })} placeholder="Optional" />
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Nilai per kolom — gunakan ✓ / — atau teks bebas (mis. &quot;Pro only&quot;).
            </p>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, columnCount)}, minmax(0, 1fr))` }}>
              {(data.columns ?? []).map((col, ci) => (
                <TextField
                  key={ci}
                  label={col.name || `Kolom ${ci + 1}`}
                  value={item.values?.[ci] ?? ""}
                  onChange={(v) => {
                    const values = [...(item.values ?? [])];
                    while (values.length < columnCount) values.push("");
                    values[ci] = v;
                    patch({ ...item, values });
                  }}
                  placeholder="✓ / —"
                />
              ))}
            </div>
          </>
        )}
      />
    </>
  );
}
