"use client";

import { Globe2 } from "lucide-react";

import { useSiteChrome } from "../site-chrome-context";

/**
 * Tombol "pakai di semua halaman" untuk blok Header dan Footer.
 *
 * Saat dinyalakan dan versi situs sudah ada, versi itulah yang diadopsi —
 * bukan isi halaman ini yang menimpa header milik halaman-halaman lain. Kalau
 * belum ada, halaman ini yang menjadi sumbernya.
 *
 * Saat dimatikan, isi yang sedang tampil disalin menjadi milik halaman ini,
 * jadi blok tidak mendadak berubah wujud.
 */
export function SiteWideToggle<T extends { siteWide?: boolean }>({
  part,
  data,
  onChange,
}: {
  part: "header" | "footer";
  data: T;
  onChange: (next: T) => void;
}) {
  const chrome = useSiteChrome();
  const shared = part === "header" ? chrome.header : chrome.footer;
  const enabled = Boolean(data.siteWide);
  const noun = part === "header" ? "header" : "footer";

  function toggle(next: boolean) {
    if (next && shared) {
      onChange({ ...(shared as unknown as T), siteWide: true });
      return;
    }
    onChange({ ...data, siteWide: next });
  }

  return (
    <div className="mb-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <label className="flex items-start gap-2.5 text-xs leading-5">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={enabled}
          onChange={(event) => toggle(event.target.checked)}
        />
        <span>
          <span className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-50">
            <Globe2 className="h-3.5 w-3.5" />
            Pakai {noun} ini di semua halaman
          </span>
          <span className="block text-zinc-500 dark:text-zinc-400">
            {enabled
              ? `Perubahan di sini berlaku untuk setiap halaman yang memakai ${noun} situs.`
              : shared
                ? `Menyalakan ini mengganti isi blok dengan ${noun} situs yang sudah ada.`
                : `Halaman ini akan menjadi sumber ${noun} situs untuk halaman lain.`}
          </span>
        </span>
      </label>
    </div>
  );
}
