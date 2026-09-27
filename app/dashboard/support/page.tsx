import Link from "next/link";
import {
  CreditCard,
  FileText,
  Home,
  LifeBuoy,
  MessageCircle,
  Plug,
  ShoppingCart,
} from "lucide-react";

import { requireCurrentWorkspace } from "@/lib/workspace";
import { publicSiteHref } from "@/lib/public-url";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";

export const metadata = { title: "Bantuan · My Landing" };

const setupItems = [
  {
    href: "/dashboard/pages",
    title: "Atur homepage",
    description: "Pilih halaman utama untuk subdomain publik workspace.",
    icon: Home,
  },
  {
    href: "/dashboard/settings?tab=tampilan",
    title: "Tampilan dan domain",
    description: "Upload logo, pilih warna, favicon, dan domain kustom.",
    icon: FileText,
  },
  {
    href: "/dashboard/settings/integrations",
    title: "Integrasi tracking",
    description: "Hubungkan Meta Pixel, GA4, GTM, Search Console, dan WhatsApp.",
    icon: Plug,
  },
  {
    href: "/dashboard/settings?tab=ecommerce",
    title: "Checkout toko",
    description: "Atur mata uang, payment manual, pickup, stok, dan notifikasi.",
    icon: ShoppingCart,
  },
  {
    href: "/dashboard/settings?tab=billing",
    title: "Billing dan limit",
    description: "Cek plan aktif, fitur premium, dan pemakaian resource.",
    icon: CreditCard,
  },
  {
    href: "/dashboard/inbox",
    title: "Inbox WhatsApp",
    description: "Pantau percakapan customer setelah provider WhatsApp aktif.",
    icon: MessageCircle,
  },
];

export default async function SupportPage() {
  const { workspace } = await requireCurrentWorkspace();
  const publicUrl = publicSiteHref(workspace.slug);

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Bantuan"
        description="Checklist cepat untuk memastikan workspace siap dipakai dan dipublikasikan."
        action={
          <Button asChild>
            <Link href={publicUrl} target="_blank">
              Lihat site publik
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {setupItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <Card className="h-full transition hover:border-zinc-300 hover:bg-zinc-50 dark:hover:border-zinc-700 dark:hover:bg-zinc-900">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <CardTitle className="text-base">{item.title}</CardTitle>
                      <CardDescription>{item.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
              <LifeBuoy className="h-4 w-4" />
            </span>
            <div>
              <CardTitle>Butuh bantuan manual?</CardTitle>
              <CardDescription>
                Kirim konteks workspace, halaman yang sedang dibuka, dan langkah
                terakhir sebelum error agar troubleshooting lebih cepat.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button asChild variant="outline" className="justify-start">
            <Link href="/dashboard/settings">
              Buka pusat pengaturan
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start">
            <a href="mailto:support@landing.my.id">
              Email support
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
