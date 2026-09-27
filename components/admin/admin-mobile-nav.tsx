"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Menu } from "lucide-react";

import { AdminNav } from "@/components/admin/admin-nav";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function AdminMobileNav() {
  const [open, setOpen] = useState(false);
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild><Button variant="ghost" size="icon" className="md:hidden" aria-label="Buka menu admin"><Menu className="h-5 w-5" /></Button></SheetTrigger>
    <SheetContent side="left" className="flex w-72 flex-col border-zinc-800 bg-zinc-950 p-0 text-white">
      <SheetHeader className="border-b border-zinc-800 px-4 py-4"><SheetTitle className="flex flex-col gap-[4px] text-left text-white"><span className="text-[15px] font-semibold leading-none tracking-[-0.02em]">My Landing</span><span className="text-[11px] font-normal text-zinc-500">Platform Admin</span></SheetTitle></SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4"><AdminNav onNavigate={() => setOpen(false)} /></div>
      <div className="border-t border-zinc-800 p-3"><Link href="/dashboard" onClick={() => setOpen(false)} className="flex h-9 items-center gap-2 rounded-md px-2.5 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-white"><ArrowLeft className="h-4 w-4" />Kembali ke dashboard</Link></div>
    </SheetContent>
  </Sheet>;
}
