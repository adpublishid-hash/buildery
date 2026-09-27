"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Role } from "@prisma/client";
import { ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { can } from "@/lib/permissions";

import { CountPill, InboxNavBadge } from "./inbox-nav-badge";
import { dashboardNav } from "./nav-config";
import type { NavItem, NavSection } from "./nav-config";

export function SidebarNav({
  role,
  badges,
}: {
  role: Role;
  /** Live counts to show beside a menu entry, keyed by its href. */
  badges?: Record<string, number>;
}) {
  const pathname = usePathname() ?? "";
  const search = useSearchParams();
  const [manualOpen, setManualOpen] = useState<Record<string, boolean>>({});
  // One answer for "where am I" shared with the header breadcrumb, so the two
  // never disagree (eCommerce's settings shortcut vs. Pengaturan itself).
  const here = locateInNav(pathname, search);

  const visibleSections = useMemo(() => visibleNav(role), [role]);
  const top = visibleSections.filter((section) => !section.bottom);
  const bottom = visibleSections.filter((section) => section.bottom);

  const renderSection = (section: NavSection) => (
    <div key={section.label} className="flex w-full flex-col gap-[6px]">
      <p className="whitespace-nowrap px-[2px] text-[11px] uppercase leading-[1.6] tracking-[0.02em] text-kv-muted-fg">
        {section.label}
      </p>
      <div className={cn("flex w-full flex-col", !section.bottom && "gap-[2px]")}>
        {section.items.map((item) => (
          <NavRow
            key={item.href}
            item={item}
            here={here}
            muted={section.bottom}
            open={manualOpen[item.href]}
            onToggle={(next) =>
              setManualOpen((curr) => ({ ...curr, [item.href]: next }))
            }
            badges={badges}
          />
        ))}
      </div>
    </div>
  );

  return (
    <nav className="kv-no-scrollbar flex min-h-0 w-full flex-1 flex-col justify-between gap-[14px] overflow-y-auto overflow-x-hidden">
      <div className="flex w-full flex-col gap-[14px]">{top.map(renderSection)}</div>
      {bottom.map(renderSection)}
    </nav>
  );
}

function visibleNav(role: Role): NavSection[] {
  return dashboardNav
    .map((section) => ({
      ...section,
      items: section.items
        .map((item) => filterItem(item, role))
        .filter(Boolean) as NavItem[],
    }))
    .filter((section) => section.items.length > 0);
}

const ROW =
  "group/nav flex h-[30px] w-full items-center justify-between rounded-[8px] px-[10px] text-left text-[13px] leading-none outline-none transition-[background-color,box-shadow,border-color,color] duration-150 focus-visible:ring-[3px] focus-visible:ring-kv-ring/40";
const ROW_ACTIVE =
  "border-[0.8px] border-kv-border bg-kv-card text-kv-fg shadow-kv-active";
const ROW_IDLE =
  "border-[0.8px] border-transparent hover:bg-white/70 hover:text-kv-fg";

function NavRow({
  item,
  here,
  muted,
  open: manual,
  onToggle,
  badges,
}: {
  item: NavItem;
  here: NavLocation | null;
  muted?: boolean;
  open?: boolean;
  onToggle: (next: boolean) => void;
  badges?: Record<string, number>;
}) {
  const Icon = item.icon;
  const hasChildren = Boolean(item.children?.length);
  const mine = here?.item.href === item.href;
  const activeChild = hasChildren && mine && here?.child ? here.child.href : null;
  const open = manual ?? activeChild !== null;
  const idleText = muted ? "text-kv-muted-fg" : "text-kv-secondary-fg";

  const label = (
    <span className="flex min-w-0 items-center gap-[10px]">
      <span className="flex transition-transform duration-200 ease-out group-hover/nav:scale-110">
        <Icon className="h-[16px] w-[16px] shrink-0" strokeWidth={1.6} />
      </span>
      <span className="truncate whitespace-nowrap">{item.label}</span>
    </span>
  );

  if (!hasChildren) {
    const active = mine && !here?.child;
    return (
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(ROW, active ? ROW_ACTIVE : cn(ROW_IDLE, idleText))}
      >
        {label}
        <NavBadge href={item.href} count={badges?.[item.href]} />
      </Link>
    );
  }

  return (
    <div className="flex w-full flex-col">
      <button
        type="button"
        onClick={() => onToggle(!open)}
        aria-expanded={open}
        className={cn(ROW, ROW_IDLE, activeChild ? "text-kv-fg" : idleText)}
      >
        {label}
        <span
          className={cn(
            "flex transition-transform duration-300 ease-out-expo",
            !open && "rotate-180"
          )}
        >
          <ChevronUp className="h-[12px] w-[12px]" strokeWidth={2} />
        </span>
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out-expo",
          open ? "mt-[2px] grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-[2px]">
            {item.children!.map((child) => {
              const childActive = child.href === activeChild;
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  tabIndex={open ? 0 : -1}
                  aria-current={childActive ? "page" : undefined}
                  className="group/sub relative flex h-[26px] w-full items-center justify-end pl-[10px] outline-none"
                >
                  <span
                    className={cn(
                      "flex h-full w-[188px] items-center rounded-md px-0 text-[12px] leading-none transition-[color,background-color,padding] duration-200 group-hover/sub:bg-white/70 group-hover/sub:pl-[6px] group-hover/sub:text-kv-fg group-focus-visible/sub:ring-[3px] group-focus-visible/sub:ring-kv-ring/40",
                      childActive ? "pl-[6px] font-medium text-kv-fg" : "text-kv-muted-fg"
                    )}
                  >
                    <span className="truncate">{child.label}</span>
                  </span>
                  <svg
                    aria-hidden
                    width="9"
                    height="21"
                    viewBox="0 0 9 21"
                    fill="none"
                    className="pointer-events-none absolute left-[18px] top-[-7px]"
                  >
                    <path
                      d="M0.4 0.4V18.4C0.4 19.5 1.3 20.4 2.4 20.4H8.4"
                      stroke="#9CA3AF"
                      strokeWidth="0.8"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute left-[23px] top-[11px] h-[4px] w-[4px] rounded-full border-[0.8px] border-kv-subtle bg-kv-bg transition-transform duration-200",
                      childActive && "scale-150 border-kv-fg bg-kv-fg"
                    )}
                  />
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function filterItem(item: NavItem, role: Role): NavItem | null {
  const allowed = !item.permission || can(role, item.permission);
  const children = item.children
    ?.map((child) => filterItem(child, role))
    .filter(Boolean) as NavItem[] | undefined;

  if (!allowed && (!children || children.length === 0)) return null;
  return { ...item, children };
}

export type NavLocation = { item: NavItem; child: NavItem | null };

/** Minimal read-only view of URLSearchParams, as returned by useSearchParams. */
type SearchLike = { get(name: string): string | null } | null;

/**
 * How well a menu href describes the current URL, or -1 when it does not.
 *
 * Paths match exactly or as a prefix (a record under a list page). A query in
 * the href (`/dashboard/settings?tab=ecommerce`) must agree with the URL for
 * every key the URL actually sets; agreeing earns a bonus, so the settings
 * page opened on the eCommerce tab lights up eCommerce's shortcut, not the
 * general "Workspace" tab.
 */
function matchScore(href: string, pathname: string, search: SearchLike) {
  const [path, query] = href.split("?");
  const pathHit =
    pathname === path || (path !== "/dashboard" && pathname.startsWith(`${path}/`));
  if (!pathHit) return -1;
  let score = path.length * 4;
  if (query) {
    for (const [key, value] of new URLSearchParams(query)) {
      const actual = search?.get(key);
      if (actual == null) continue;
      if (actual !== value) return -1;
      score += 2;
    }
  }
  return score;
}

/**
 * Where the current page sits in the menu: the top-level entry and, when the
 * page belongs to one of its children, that child. On a tie, an entry whose
 * own top-level item also matches wins, so /dashboard/settings is
 * "Pengaturan", not eCommerce's shortcut to it.
 */
export function locateInNav(pathname: string, search: SearchLike = null): NavLocation | null {
  let best: (NavLocation & { score: number }) | null = null;
  for (const section of dashboardNav) {
    for (const item of section.items) {
      const own = matchScore(item.href, pathname, search) >= 0 ? 1 : 0;
      for (const child of item.children ?? []) {
        const hit = matchScore(child.href, pathname, search);
        if (hit < 0) continue;
        const score = hit + own;
        if (!best || score > best.score) best = { item, child, score };
      }
      if (own) {
        const score = matchScore(item.href, pathname, search) + 1;
        if (!best || score > best.score) best = { item, child: null, score };
      }
    }
  }
  return best ? { item: best.item, child: best.child } : null;
}

const INBOX_HREF = "/dashboard/inbox";

/**
 * Unread work waiting behind a menu entry.
 *
 * The inbox is the only one that changes without the operator doing anything,
 * so it gets a component that keeps itself current; everything else would just
 * be a number rendered with the page.
 */
function NavBadge({ href, count }: { href: string; count?: number }) {
  if (href === INBOX_HREF) return <InboxNavBadge initial={count ?? 0} />;
  if (!count || count <= 0) return null;
  return <CountPill count={count} />;
}
