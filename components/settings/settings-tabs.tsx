"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  BellRing,
  Boxes,
  CreditCard,
  LifeBuoy,
  Palette,
  Plug,
  Settings,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";

import { TabBar, type TabItem } from "@/components/ui/tab-bar";
import {
  resolveSettingsTab,
  SETTINGS_TAB_LABEL,
  type SettingsTab,
} from "@/lib/settings-tabs";

const ICONS: Record<SettingsTab | "integrasi", LucideIcon> = {
  umum: Settings,
  tampilan: Palette,
  anggota: Users,
  integrasi: Plug,
  ecommerce: Boxes,
  "sales-notif": BellRing,
  billing: CreditCard,
  bantuan: LifeBuoy,
  "zona-bahaya": Trash2,
};

/** Tab order in the bar; "integrasi" is its own route, the rest are `?tab=`. */
const ORDER: (SettingsTab | "integrasi")[] = [
  "umum",
  "tampilan",
  "anggota",
  "integrasi",
  "ecommerce",
  "sales-notif",
  "billing",
  "bantuan",
  "zona-bahaya",
];

const INTEGRATIONS_PATH = "/dashboard/settings/integrations";

export function SettingsTabs({ canDelete }: { canDelete: boolean }) {
  const pathname = usePathname() ?? "";
  const tab = useSearchParams()?.get("tab");
  const active =
    pathname === INTEGRATIONS_PATH ? "integrasi" : resolveSettingsTab(tab ?? undefined, { canDelete });

  const items: TabItem[] = ORDER.filter(
    (key) => key !== "zona-bahaya" || canDelete
  ).map((key) => ({
    key,
    // Shorter than the page heading — the bar has to fit on a phone.
    label: key === "sales-notif" ? "Sales notif" : SETTINGS_TAB_LABEL[key],
    icon: ICONS[key],
    href: key === "integrasi" ? INTEGRATIONS_PATH : `/dashboard/settings?tab=${key}`,
    danger: key === "zona-bahaya",
  }));

  return <TabBar ariaLabel="Bagian pengaturan" items={items} active={active} />;
}
