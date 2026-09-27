import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Boxes,
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
  UserCircle,
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
};

export type NavSection = {
  label: string;
  /** Pinned to the foot of the sidebar in quieter text (Kravio's "Support"). */
  bottom?: boolean;
  items: NavItem[];
};

export const dashboardNav: NavSection[] = [
  {
    label: "Menu Utama",
    items: [
      {
        label: "Ringkasan",
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
            label: "Discounts",
            href: "/dashboard/coupons",
            icon: Ticket,
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
            label: "Funnels",
            href: "/dashboard/funnels",
            icon: Filter,
            permission: "sites.view",
          },
          {
            label: "Pengaturan",
            href: "/dashboard/settings?tab=ecommerce",
            icon: Settings,
            permission: "sites.view",
          },
        ],
      },
      {
        label: "Konten",
        href: "/dashboard/pages",
        icon: FileText,
        permission: "sites.view",
        children: [
          {
            label: "Halaman",
            href: "/dashboard/pages",
            icon: FileText,
            permission: "sites.view",
          },
          {
            label: "Blog",
            href: "/dashboard/blog",
            icon: Newspaper,
            permission: "sites.view",
          },
          {
            label: "Form",
            href: "/dashboard/forms",
            icon: ClipboardList,
            permission: "sites.view",
          },
          {
            label: "Tema",
            href: "/dashboard/theme",
            icon: Palette,
            permission: "sites.view",
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
            label: "Kursus",
            href: "/dashboard/courses",
            icon: GraduationCap,
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
      {
        label: "Afiliasi",
        href: "/dashboard/affiliate",
        icon: Handshake,
        permission: "affiliate.view",
      },
    ],
  },
  {
    label: "Analitik & Insight",
    items: [
      {
        label: "Analitik",
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
            label: "Kampanye Iklan",
            href: "/dashboard/analytics/campaigns",
            icon: Megaphone,
            permission: "dashboard.view",
          },
          {
            label: "Pembayaran",
            href: "/dashboard/payments",
            icon: Wallet,
            permission: "billing.view",
          },
          {
            label: "Laporan Pajak",
            href: "/dashboard/payments/tax",
            icon: ReceiptText,
            permission: "billing.view",
          },
          {
            label: "Payment Audit",
            href: "/dashboard/payments/audit",
            icon: ShieldAlert,
            permission: "billing.manage",
          },
          {
            label: "Job Runner",
            href: "/dashboard/system/jobs",
            icon: Timer,
            permission: "billing.manage",
          },
        ],
      },
    ],
  },
  {
    label: "Workspace",
    bottom: true,
    items: [
      {
        label: "Workspace",
        href: "/dashboard/workspaces",
        icon: Boxes,
        permission: "workspaces.view",
      },
      {
        label: "Pengguna",
        href: "/dashboard/users",
        icon: Users,
        permission: "users.view",
      },
      {
        label: "Super Admin",
        href: "/admin",
        icon: ShieldCheck,
        permission: "users.manage",
      },
      {
        label: "Pengaturan",
        href: "/dashboard/settings",
        icon: Settings,
        children: [
          {
            label: "Workspace",
            href: "/dashboard/settings?tab=umum",
            icon: Settings,
          },
          {
            label: "Integrasi",
            href: "/dashboard/settings/integrations",
            icon: Plug,
          },
          {
            label: "Media",
            href: "/dashboard/media",
            icon: ImageIcon,
          },
          {
            // Akun pribadi, bukan workspace: nama dan password milik pengguna
            // yang sedang masuk.
            label: "Akun saya",
            href: "/dashboard/account",
            icon: UserCircle,
          },
        ],
      },
      {
        label: "Billing",
        href: "/dashboard/billing",
        icon: CreditCard,
        permission: "billing.view",
      },
      {
        label: "Bantuan",
        href: "/dashboard/support",
        icon: LifeBuoy,
      },
    ],
  },
];
