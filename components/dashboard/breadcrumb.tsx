import type { LucideIcon } from "lucide-react";
import { LayoutDashboard } from "lucide-react";

import { locateInNav } from "./sidebar-nav";

// Segments that are record ids (cuid) — shown as a generic label.
function isId(segment: string) {
  return /^c[a-z0-9]{20,}$/i.test(segment) || segment.length > 20;
}

const LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  pages: "Pages",
  products: "Products",
  orders: "Orders",
  payments: "Payments",
  audit: "Audit",
  customers: "Customers",
  "follow-up": "Follow Up",
  abandoned: "Abandoned",
  funnels: "Funnels",
  ecommerce: "eCommerce",
  courses: "Courses",
  blog: "Blog",
  forms: "Forms",
  affiliate: "Affiliate",
  coupons: "Coupons",
  membership: "Membership",
  analytics: "Analytics",
  workspaces: "Workspaces",
  users: "Users",
  billing: "Billing",
  settings: "Settings",
  theme: "Tema",
  support: "Support",
  new: "New",
  edit: "Edit",
  builder: "Builder",
  preview: "Preview",
  modules: "Modules",
  lessons: "Lessons",
  submissions: "Submissions",
  categories: "Categories",
  branding: "Branding",
  members: "Members",
  integrations: "Integrations",
  program: "Program",
  commissions: "Commissions",
  plans: "Plans",
  detail: "Detail",
};

function labelFor(segment: string) {
  if (LABELS[segment]) return LABELS[segment];
  if (isId(segment)) return "Detail";
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

export type Crumb = { label: string; href?: string };

/**
 * The header breadcrumb, named the way the sidebar names things: the menu
 * entry (with its icon) first, then the sub-page, then anything deeper in the
 * URL (a record, "New", "Builder"). Record ids are not links — a bare id
 * segment usually has no page of its own.
 */
export function crumbsFor(
  pathname: string,
  search: { get(name: string): string | null } | null = null
): {
  section: { label: string; href: string; icon: LucideIcon };
  trail: Crumb[];
} {
  const loc = locateInNav(pathname, search);
  const root = { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard };

  if (!loc) {
    const segments = pathname.split("/").filter(Boolean).slice(1);
    return { section: root, trail: deeper(segments, "/dashboard") };
  }

  const itemHref = loc.item.href.split(/[?#]/)[0];
  if (itemHref === "/dashboard") {
    return {
      section: { label: loc.item.label, href: itemHref, icon: loc.item.icon },
      trail: [{ label: "Dashboard" }],
    };
  }

  const base = (loc.child ?? loc.item).href.split(/[?#]/)[0];
  const rest = pathname.slice(base.length).split("/").filter(Boolean);
  const extra = deeper(rest, base);

  if (loc.child) {
    return {
      section: { label: loc.item.label, href: itemHref, icon: loc.item.icon },
      trail: [{ label: loc.child.label, href: base }, ...extra],
    };
  }
  return {
    section: { ...root, icon: loc.item.icon },
    trail: [{ label: loc.item.label, href: base }, ...extra],
  };
}

function deeper(segments: string[], base: string): Crumb[] {
  let href = base;
  return segments.map((segment) => {
    href = `${href}/${segment}`;
    return { label: labelFor(segment), href: isId(segment) ? undefined : href };
  });
}
