import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireSuperAdmin } from "@/lib/admin";
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";

export const metadata = { title: "Admin · My Landing" };

// The admin area is per-request (live platform data, super-admin gate) —
// never statically prerendered.
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSuperAdmin();

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 md:flex">
        <div className="flex h-16 flex-col justify-center border-b border-zinc-800 px-5">
          <span className="text-[15px] font-semibold leading-none tracking-[-0.02em] text-zinc-50">My Landing</span>
          <span className="mt-[4px] text-[11px] text-zinc-500">Platform Admin</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4"><AdminNav /></div>
        <div className="border-t border-zinc-800 p-3">
          <Link
            href="/dashboard"
            className="flex h-9 items-center gap-2 rounded-md px-2.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Kembali ke dashboard
          </Link>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-zinc-200 bg-white/95 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2"><AdminMobileNav /><span className="text-sm font-medium text-zinc-900">
            Platform administration
          </span></div>
          <span className="text-xs text-zinc-500">{user.email}</span>
        </header>
        <main className="kv-fields flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
