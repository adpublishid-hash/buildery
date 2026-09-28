"use client";

import { usePathname } from "next/navigation";
import { Banknote, Coins, Settings2, Users } from "lucide-react";

import { TabBar } from "@/components/ui/tab-bar";

const items = [
  { key: "affiliates", href: "/dashboard/affiliate", label: "Affiliates", icon: Users },
  { key: "commissions", href: "/dashboard/affiliate/commissions", label: "Commissions", icon: Coins },
  { key: "payouts", href: "/dashboard/affiliate/payouts", label: "Payouts", icon: Banknote },
  { key: "program", href: "/dashboard/affiliate/program", label: "Program", icon: Settings2 },
];

export function AffiliateNav({
  pendingAffiliates = 0,
  pendingCommissions = 0,
  eligiblePayouts = 0,
}: {
  /** Applications waiting for review, shown on the Affiliates tab. */
  pendingAffiliates?: number;
  pendingCommissions?: number;
  eligiblePayouts?: number;
}) {
  const pathname = usePathname() ?? "";
  const active =
    items.find((item) => item.key !== "affiliates" && pathname.startsWith(item.href))?.key ??
    "affiliates";
  const counts: Record<string, number> = {
    affiliates: pendingAffiliates,
    commissions: pendingCommissions,
    payouts: eligiblePayouts,
  };

  return (
    <TabBar
      ariaLabel="Affiliate sections"
      active={active}
      className="mb-[16px]"
      items={items.map((item) => ({ ...item, count: counts[item.key] }))}
    />
  );
}
