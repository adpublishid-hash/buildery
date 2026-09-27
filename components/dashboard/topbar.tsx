"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { PanelLeft, Settings } from "lucide-react";

import { cn } from "@/lib/utils";

import { crumbsFor } from "./breadcrumb";
import { useDashboardShell } from "./shell";

/**
 * The 48px bar above every dashboard page: sidebar toggle and breadcrumb on
 * the left, notifications and settings on the right. The sidebar toggle is
 * always there on mobile and on desktop only once the sidebar is folded away.
 */
export function Topbar({ notifications }: { notifications?: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const search = useSearchParams();
  const { collapsed, showSidebar } = useDashboardShell();
  const { section, trail } = crumbsFor(pathname, search);
  const SectionIcon = section.icon;

  return (
    <header className="flex h-[48px] w-full min-w-0 items-center justify-between gap-[12px] px-[4px] py-[12px]">
      <div className="flex min-w-0 items-center gap-[12px]">
        <button
          type="button"
          onClick={showSidebar}
          aria-label="Buka sidebar"
          className={cn(
            "-my-[4px] -ml-[4px] rounded-md p-[4px] text-kv-secondary-fg outline-none transition-colors hover:bg-black/[0.05] focus-visible:ring-[3px] focus-visible:ring-kv-ring/40",
            !collapsed && "lg:hidden"
          )}
        >
          <PanelLeft className="h-[16px] w-[16px] rotate-180" strokeWidth={1.6} />
        </button>

        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-[12px]">
          <Link
            href={section.href}
            className="group/bc flex shrink-0 items-center gap-[10px] rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-kv-ring/40"
          >
            <SectionIcon className="h-[16px] w-[16px] text-kv-secondary-fg" strokeWidth={1.6} />
            <span className="hidden whitespace-nowrap text-[14px] leading-none text-kv-muted-fg transition-colors group-hover/bc:text-kv-fg sm:inline">
              {section.label}
            </span>
          </Link>
          {trail.map((crumb, index) => {
            const last = index === trail.length - 1;
            return (
              <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-[12px]">
                <Slash />
                {last || !crumb.href ? (
                  <span
                    aria-current={last ? "page" : undefined}
                    className={cn(
                      "truncate whitespace-nowrap text-[14px] leading-none",
                      last ? "font-medium text-kv-fg" : "text-kv-muted-fg"
                    )}
                  >
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="truncate whitespace-nowrap text-[14px] leading-none text-kv-muted-fg transition-colors hover:text-kv-fg"
                  >
                    {crumb.label}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-[12px]">
        {notifications}
        <Link
          href="/dashboard/settings"
          aria-label="Pengaturan"
          title="Pengaturan"
          className="group/set -m-[4px] inline-flex h-[24px] w-[24px] items-center justify-center rounded-md p-[4px] text-kv-secondary-fg outline-none transition-colors hover:bg-black/[0.04] focus-visible:ring-[3px] focus-visible:ring-kv-ring/40"
        >
          <Settings
            className="h-[16px] w-[16px] transition-transform duration-500 ease-out-expo group-hover/set:rotate-90"
            strokeWidth={1.6}
          />
        </Link>
      </div>
    </header>
  );
}

function Slash() {
  return (
    <svg aria-hidden width="7" height="11" viewBox="0 0 7 11" fill="none" className="shrink-0">
      <path d="M0.43 10.26L6.43 0.26" stroke="#6B7280" />
    </svg>
  );
}
