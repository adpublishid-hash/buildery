"use client";

import { useEffect, useState } from "react";

import type { WhatsappFloatData } from "@/lib/blocks/schema";
import { normalizeWhatsappNumber } from "@/lib/template-personalize";
import { cn } from "@/lib/utils";

function WhatsappGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.83 9.83 0 0 0 12.04 2Zm.01 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.23 8.23 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.55-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42-.15 0-.31-.02-.48-.02a.92.92 0 0 0-.67.31c-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z" />
    </svg>
  );
}

/**
 * Tombol WhatsApp yang menempel di pojok layar — pola yang sangat umum di
 * landing page UMKM, karena kebanyakan pembeli di sini lebih suka bertanya
 * lewat chat daripada mengisi formulir.
 *
 * Tanpa nomor yang sah, tombol tidak dirender sama sekali di halaman publik:
 * tombol yang membuka WhatsApp tanpa tujuan lebih buruk daripada tidak ada.
 * Di kanvas builder, posisinya diubah ke dalam alur halaman lewat CSS
 * (`[data-bd-editor] [data-bd-float]`), supaya tidak melayang di atas
 * antarmuka builder.
 */
export function WhatsappFloatBlock({ data }: { data: WhatsappFloatData }) {
  const number = normalizeWhatsappNumber(data.phone);
  const delay = data.delaySeconds ?? 0;
  const [visible, setVisible] = useState(delay === 0);

  useEffect(() => {
    if (delay === 0) return;
    const timer = window.setTimeout(() => setVisible(true), delay * 1000);
    return () => window.clearTimeout(timer);
  }, [delay]);

  const label = data.label?.trim() || "Chat via WhatsApp";

  if (!number) {
    return (
      <div
        data-bd-float-placeholder=""
        className="mx-auto my-4 max-w-md rounded-xl border border-dashed border-zinc-300 px-4 py-3 text-center text-xs text-zinc-500"
      >
        Tombol WhatsApp belum punya nomor. Isi nomor bisnismu di pengaturan
        blok — tanpa nomor, tombol ini tidak tampil di halaman publik.
      </div>
    );
  }

  const message = data.message?.trim();
  const href = `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ""}`;

  return (
    <a
      data-bd-float=""
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={cn(
        "fixed bottom-5 z-40 inline-flex items-center gap-2 rounded-full bg-[#25D366] text-white shadow-lg shadow-black/20 transition-all duration-300 hover:scale-105 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366]",
        data.position === "left" ? "left-5" : "right-5",
        data.showLabel ? "py-3 pl-3 pr-4" : "p-3.5",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      )}
    >
      <WhatsappGlyph className="h-6 w-6 shrink-0" />
      {data.showLabel ? (
        <span className="text-sm font-semibold">{label}</span>
      ) : null}
    </a>
  );
}
