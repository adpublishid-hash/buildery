import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  Eye,
  FileText,
  Filter,
  GraduationCap,
  Handshake,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  Mail,
  Newspaper,
  Package,
  Palette,
  Plug,
  ReceiptText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  ShieldAlert,
  Ticket,
  Timer,
  Users,
  Wallet,
} from "lucide-react";

import type { Permission } from "@/lib/permissions";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: Permission;
  children?: NavItem[];
  /**
   * The href's query is also what the page shows when the URL leaves it out
   * (the settings page opens on its first tab), so a bare URL matches too.
   */
  isDefault?: boolean;
};

export type NavSection = {
  /** Accessible name for the group; the sidebar separates groups with a rule, not a heading. */
  label: string;
  /** Pinned to the foot of the sidebar in quieter text. */
  bottom?: boolean;
  items: NavItem[];
};

/**
 * The dashboard menu, grouped by what the operator is doing:
 *
 * 1. Core — daily check-in: overview, inbox, and the numbers.
 * 2. Business — the things being sold or published, each a collapsible group.
 * 3. Tools — standalone features that serve every business line.
 * 4. Workspace — how the site looks and is wired up, pinned at the bottom.
 */
export const dashboardNav: NavSection[] = [
  {
    label: "Core",
    items: [
      {
        label: "Overview",
        href: "/dashboard",
        icon: LayoutDashboard,
        permission: "dashboard.view",
      },
      {
        label: "Inbox",
        href: "/dashboard/inbox",
        icon: Inbox,
        permission: "sites.view",
      },
      {
        label: "Analytics",
        href: "/dashboard/analytics",
        icon: BarChart3,
        permission: "dashboard.view",
        children: [
          {
            label: "Traffic",
            href: "/dashboard/analytics",
            icon: Eye,
            permission: "dashboard.view",
          },
          {
            label: "Ad campaigns",
            href: "/dashboard/analytics/campaigns",
            icon: Megaphone,
            permission: "dashboard.view",
          },
        ],
      },
      {
        label: "Payments",
        href: "/dashboard/payments",
        icon: Wallet,
        permission: "billing.view",
        children: [
          {
            label: "Transactions",
            href: "/dashboard/payments",
            icon: Wallet,
            permission: "billing.view",
          },
          {
            label: "Tax report",
            href: "/dashboard/payments/tax",
            icon: ReceiptText,
            permission: "billing.view",
          },
          {
            label: "Payment audit",
            href: "/dashboard/payments/audit",
            icon: ShieldAlert,
            permission: "billing.manage",
          },
        ],
      },
    ],
  },
  {
    label: "Business",
    items: [
      {
        label: "eCommerce",
        href: "/dashboard/ecommerce",
        icon: ShoppingBag,
        permission: "sites.view",
        children: [
          {
            label: "Products",
            href: "/dashboard/products",
            icon: Package,
            permission: "sites.view",
          },
          {
            label: "Orders",
            href: "/dashboard/orders",
            icon: ShoppingBag,
            permission: "sites.view",
          },
          {
            label: "Customers",
            href: "/dashboard/customers",
            icon: Users,
            permission: "sites.view",
          },
          {
            label: "Promotions",
            href: "/dashboard/coupons",
            icon: Ticket,
            permission: "sites.view",
          },
          {
            label: "Funnels",
            href: "/dashboard/funnels",
            icon: Filter,
            permission: "sites.view",
          },
          {
            label: "Follow Up",
            href: "/dashboard/follow-up",
            icon: Mail,
            permission: "sites.view",
          },
          {
            label: "Abandoned",
            href: "/dashboard/abandoned",
            icon: ShoppingCart,
            permission: "sites.view",
          },
          {
            label: "Settings",
            href: "/dashboard/settings?tab=ecommerce",
            icon: Settings,
            permission: "sites.view",
          },
        ],
      },
      {
        label: "Content",
        href: "/dashboard/pages",
        icon: FileText,
        permission: "sites.view",
        children: [
          {
            label: "Pages",
            href: "/dashboard/pages",
            icon: FileText,
            permission: "sites.view",
          },
          {
            label: "Posts",
            href: "/dashboard/blog",
            icon: Newspaper,
            permission: "sites.view",
          },
          {
            label: "Media",
            href: "/dashboard/media",
            icon: ImageIcon,
          },
        ],
      },
      {
        label: "LMS",
        href: "/dashboard/courses",
        icon: GraduationCap,
        permission: "sites.view",
        children: [
          {
            label: "Courses",
            href: "/dashboard/courses",
            icon: GraduationCap,
            permission: "sites.view",
          },
          {
            label: "Students",
            href: "/dashboard/courses/students",
            icon: Users,
            permission: "sites.view",
          },
          {
            label: "Grading",
            href: "/dashboard/courses/grading",
            icon: ClipboardCheck,
            permission: "sites.view",
          },
          {
            label: "Membership",
            href: "/dashboard/membership",
            icon: CreditCard,
            permission: "sites.view",
          },
        ],
      },
    ],
  },
  {
    label: "Tools",
    items: [
      {
        label: "Forms",
        href: "/dashboard/forms",
        icon: ClipboardList,
        permission: "sites.view",
      },
      {
        label: "Affiliates",
        href: "/dashboard/affiliate",
        icon: Handshake,
        permission: "affiliate.view",
      },
    ],
  },
  {
    label: "Workspace",
    bottom: true,
    items: [
      {
        label: "Appearance",
        href: "/dashboard/theme",
        icon: Palette,
        permission: "sites.view",
      },
      {
        label: "Integrations",
        href: "/dashboard/settings/integrations",
        icon: Plug,
      },
      {
        label: "Notifications",
        href: "/dashboard/settings?tab=sales-notif",
        icon: Bell,
      },
      {
        label: "Settings",
        href: "/dashboard/settings",
        icon: Settings,
        children: [
          {
            label: "General",
            href: "/dashboard/settings?tab=umum",
            icon: Settings,
            isDefault: true,
          },
          {
            label: "Team",
            href: "/dashboard/users",
            icon: Users,
            permission: "users.view",
          },
          {
            label: "Workspaces",
            href: "/dashboard/workspaces",
            icon: Boxes,
            permission: "workspaces.view",
          },
          {
            label: "Billing",
            href: "/dashboard/billing",
            icon: CreditCard,
            permission: "billing.view",
          },
          {
            label: "Job runner",
            href: "/dashboard/system/jobs",
            icon: Timer,
            permission: "billing.manage",
          },
          {
            label: "Help",
            href: "/dashboard/support",
            icon: LifeBuoy,
          },
        ],
      },
      {
        label: "Super Admin",
        href: "/admin",
        icon: ShieldCheck,
        permission: "users.manage",
      },
    ],
  },
];
