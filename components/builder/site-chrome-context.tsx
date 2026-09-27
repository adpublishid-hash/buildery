"use client";

import { createContext, useContext } from "react";

import type { SiteChrome } from "@/lib/site-chrome";

/**
 * Header/footer situs untuk form pengaturan blok.
 *
 * Form Header dan Footer dimuat lazy dan berada beberapa lapis di bawah
 * builder; konteks ini menghindari meneruskan data situs lewat setiap lapisan.
 * Form membutuhkannya saat pemilik situs menyalakan "pakai di semua halaman":
 * kalau versi situs sudah ada, versi itulah yang diadopsi — bukan isi halaman
 * ini yang menimpa header milik halaman-halaman lain.
 */
export const SiteChromeContext = createContext<SiteChrome>({
  header: null,
  footer: null,
});

export function useSiteChrome(): SiteChrome {
  return useContext(SiteChromeContext);
}
