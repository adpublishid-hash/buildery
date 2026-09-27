"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bug,
  Activity,
  ScrollText,
  CreditCard,
  Flag,
  LayoutGrid,
  LayoutTemplate,
  Boxes,
  Receipt,
  SlidersHorizontal,
  ListChecks,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

const groups = [
  { label: "Platform", items: [
    { href: "/admin", label: "Overview", icon: LayoutGrid },
    { href: "/admin/users", label: "Users", icon: Users },
    { href: "/admin/workspaces", label: "Workspaces", icon: Boxes },
  ] },
  { label: "Revenue", items: [
    { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
    { href: "/admin/invoices", label: "Invoices", icon: Receipt },
    { href: "/admin/plans", label: "Plans", icon: ListChecks },
    { href: "/admin/billing-settings", label: "Billing settings", icon: SlidersHorizontal },
  ] },
  { label: "Content", items: [
    { href: "/admin/templates", label: "Templates", icon: LayoutTemplate },
    { href: "/admin/reports", label: "Reports", icon: Flag },
  ] },
  { label: "System", items: [
    { href: "/admin/errors", label: "Errors", icon: Bug },
    { href: "/admin/health", label: "Health", icon: Activity },
    { href: "/admin/audit", label: "Audit log", icon: ScrollText },
  ] },
];

export function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? "";
  return (
    <nav className="space-y-5">
      {groups.map((group) => <div key={group.label}>
        <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase text-zinc-500">{group.label}</p>
        <div className="space-y-0.5">{group.items.map((item) => {
        const Icon = item.icon;
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
              active
                ? "bg-zinc-800 text-zinc-50"
                : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-50"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
        })}</div>
      </div>)}
    </nav>
  );
}
