"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard/membership", label: "Overview" },
  { href: "/dashboard/membership/plans", label: "Plans" },
  { href: "/dashboard/membership/members", label: "Members" },
];

export function MembershipNav() {
  const pathname = usePathname() ?? "";
  return (
    <div className="mb-6 flex gap-1 rounded-lg border border-zinc-200 bg-white p-1">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-3 py-1 text-sm transition-colors",
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
