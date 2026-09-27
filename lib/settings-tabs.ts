/**
 * The settings tabs, shared by the server page (which decides what to query)
 * and the client tab bar (which decides what to highlight).
 *
 * Kept out of the client component on purpose: everything exported from a
 * "use client" module becomes a client reference, so the server page could not
 * call `resolveSettingsTab` if it lived there.
 */

export const SETTINGS_TABS = [
  "umum",
  "tampilan",
  "anggota",
  "ecommerce",
  "sales-notif",
  "billing",
  "bantuan",
  "zona-bahaya",
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const DEFAULT_SETTINGS_TAB: SettingsTab = "umum";

export const SETTINGS_TAB_LABEL: Record<SettingsTab | "integrasi", string> = {
  umum: "Umum",
  tampilan: "Tampilan",
  anggota: "Anggota",
  integrasi: "Integrasi",
  ecommerce: "eCommerce",
  "sales-notif": "Notifikasi penjualan",
  billing: "Billing",
  bantuan: "Bantuan",
  "zona-bahaya": "Zona bahaya",
};

/** Unknown or missing `?tab=` falls back to the first tab. */
export function resolveSettingsTab(
  value: string | string[] | undefined,
  options: { canDelete?: boolean } = {}
): SettingsTab {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!SETTINGS_TABS.includes(raw as SettingsTab)) return DEFAULT_SETTINGS_TAB;
  const tab = raw as SettingsTab;
  // Linking straight to the danger tab without the permission shows nothing;
  // send those visitors somewhere useful instead of an empty page.
  if (tab === "zona-bahaya" && options.canDelete === false) return DEFAULT_SETTINGS_TAB;
  return tab;
}
