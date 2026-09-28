"use client";

import { usePathname } from "next/navigation";
import { CreditCard, LayoutDashboard, PanelsTopLeft, Users } from "lucide-react";

import { TabBar } from "@/components/ui/tab-bar";

const items = [
  { key: "overview", href: "/dashboard/membership", label: "Overview", icon: LayoutDashboard },
  { key: "plans", href: "/dashboard/membership/plans", label: "Plans", icon: CreditCard },
  { key: "members", href: "/dashboard/membership/members", label: "Members", icon: Users },
  { key: "settings", href: "/dashboard/membership/settings", label: "Page settings", icon: PanelsTopLeft },
];

export function MembershipNav({ expiringSoon = 0 }: { expiringSoon?: number }) {
  const pathname = usePathname() ?? "";
  const active =
    items.find((item) => item.key !== "overview" && pathname.startsWith(item.href))?.key ??
    "overview";

  return (
    <TabBar
      ariaLabel="Membership sections"
      active={active}
      className="mb-[16px]"
      items={items.map((item) => ({
        ...item,
        count: item.key === "members" ? expiringSoon : undefined,
      }))}
    />
  );
}
