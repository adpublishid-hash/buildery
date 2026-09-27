"use client";

import type { WhatsappFloatData } from "@/lib/blocks/schema";
import { isCertainWhatsappPlaceholder } from "@/lib/builder-audit";
import { normalizeWhatsappNumber } from "@/lib/template-personalize";
import {
  AreaField,
  ChoiceField,
  TextField,
  ToggleField,
} from "../fields";

export function WhatsappFloatForm({
  data,
  onChange,
}: {
  data: WhatsappFloatData;
  onChange: (d: WhatsappFloatData) => void;
}) {
  const set = (patch: Partial<WhatsappFloatData>) => onChange({ ...data, ...patch });
  const number = normalizeWhatsappNumber(data.phone);
  const placeholder =
    number !== null && isCertainWhatsappPlaceholder(`https://wa.me/${number}`);

  // Umpan balik langsung: nomor yang tidak sah membuat tombol tidak tampil
  // sama sekali, dan nomor contoh membuat penerbitan ditolak.
  const status = !data.phone?.trim()
    ? { tone: "text-zinc-500", text: "Isi nomor bisnismu. Tanpa nomor, tombol tidak tampil di halaman publik." }
    : !number
      ? { tone: "text-red-600", text: "Nomor tidak dikenali. Gunakan format 08xx atau 62xx." }
      : placeholder
        ? { tone: "text-red-600", text: "Ini nomor contoh. Ganti dengan nomor bisnismu sebelum terbit." }
        : { tone: "text-emerald-700", text: `Terhubung ke wa.me/${number}` };

  return (
    <>
      <TextField
        label="Nomor WhatsApp"
        value={data.phone}
        onChange={(v) => set({ phone: v })}
        placeholder="0812xxxxxxxx"
      />
      <p className={`-mt-1 mb-2 text-[11px] ${status.tone}`}>{status.text}</p>
      <AreaField
        label="Pesan pembuka"
        value={data.message}
        onChange={(v) => set({ message: v })}
        rows={2}
        placeholder="Halo, saya tertarik dengan…"
      />
      <TextField
        label="Label tombol"
        value={data.label}
        onChange={(v) => set({ label: v })}
      />
      <ToggleField
        label="Tampilkan label"
        checked={data.showLabel}
        onChange={(v) => set({ showLabel: v })}
        hint="Matikan untuk tombol bundar yang lebih ringkas."
      />
      <ChoiceField
        label="Posisi"
        value={data.position}
        onChange={(v) => set({ position: v })}
        options={[
          { value: "right", label: "Kanan bawah" },
          { value: "left", label: "Kiri bawah" },
        ]}
      />
      <ChoiceField
        label="Muncul setelah"
        value={String(data.delaySeconds ?? 0)}
        onChange={(v) => set({ delaySeconds: Number(v) })}
        options={[
          { value: "0", label: "Langsung" },
          { value: "3", label: "3 detik" },
          { value: "8", label: "8 detik" },
          { value: "15", label: "15 detik" },
        ]}
      />
    </>
  );
}
