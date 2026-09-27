"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard/affiliate", label: "Affiliates" },
  { href: "/dashboard/affiliate/commissions", label: "Commissions" },
  { href: "/dashboard/affiliate/payouts", label: "Payouts" },
  { href: "/dashboard/affiliate/program", label: "Program" },
];

export function AffiliateNav() {
  const pathname = usePathname() ?? "";
  return (
    <div className="mb-6 flex max-w-full gap-1 overflow-x-auto rounded-lg border border-zinc-200 bg-white p-1">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "shrink-0 rounded-md px-3 py-1 text-sm transition-colors",
              active
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:text-zinc-900"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
