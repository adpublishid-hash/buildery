"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import type { Role } from "@prisma/client";
import { ChevronsUpDown, Command, LogOut, PanelLeft, Search, Settings, UserCircle } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABEL } from "@/lib/permissions";
import { getInitials } from "@/lib/utils";

import { OPEN_COMMAND_PALETTE } from "./command-palette";
import { useDashboardShell } from "./shell";

export function SidebarCollapseButton() {
  const { hideSidebar } = useDashboardShell();
  return (
    <button
      type="button"
      onClick={hideSidebar}
      aria-label="Tutup sidebar"
      title="Tutup sidebar"
      className="-m-[4px] rounded-md p-[4px] text-kv-secondary-fg outline-none transition-colors hover:bg-black/[0.05] focus-visible:ring-[3px] focus-visible:ring-kv-ring/40"
    >
      <PanelLeft className="h-[16px] w-[16px]" strokeWidth={1.6} />
    </button>
  );
}

/**
 * Looks like Kravio's search field but opens the command palette — the
 * palette already searches menus, pages, products and orders.
 */
export function SidebarSearch() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE))}
      className="group/input flex h-[32px] w-full shrink-0 items-center gap-[8px] overflow-clip rounded-[8px] border-[0.8px] border-kv-border bg-kv-card py-[8px] pl-[10px] pr-[8px] text-left shadow-kv-soft outline-none transition-[border-color,box-shadow] duration-150 hover:border-[#d1d5db] focus-visible:border-[#9ca3af] focus-visible:shadow-[0_0_0_3px_rgba(156,163,175,0.18)]"
    >
      <Search className="h-[16px] w-[16px] shrink-0 text-kv-secondary-fg" strokeWidth={1.6} />
      <span className="min-w-0 flex-1 truncate text-[13px] leading-none text-kv-muted-fg">
        Cari apa saja
      </span>
      <span aria-hidden className="flex shrink-0 items-center text-[#565d76]">
        <span className="flex h-[16px] w-[16px] items-center justify-center rounded p-[2px]">
          <Command className="h-[12px] w-[12px]" strokeWidth={1.8} />
        </span>
        <span className="flex h-[16px] w-[16px] items-center justify-center rounded p-[2px] text-[12px] font-medium leading-none">
          K
        </span>
      </span>
    </button>
  );
}

export function SidebarAccount({
  name,
  email,
  image,
  role,
}: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: Role;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group/acct flex w-full shrink-0 items-center gap-[8px] rounded-[10px] border-[0.8px] border-kv-border bg-kv-card py-[6px] pl-[6px] pr-[8px] text-left outline-none drop-shadow-[0px_0px_4px_rgba(0,0,0,0.03)] transition-[box-shadow,transform] duration-200 hover:shadow-kv-hover focus-visible:ring-[3px] focus-visible:ring-kv-ring/40 active:scale-[0.99]"
        >
          <span className="relative flex h-[32px] w-[32px] shrink-0">
            <Avatar className="h-[32px] w-[32px] border-[0.8px] border-[#d9d9d9]">
              {image ? <AvatarImage src={image} alt={name ?? ""} /> : null}
              <AvatarFallback className="bg-[#f7f7f7] text-[12px] font-semibold tracking-[-0.12px] text-kv-secondary-fg">
                {getInitials(name)}
              </AvatarFallback>
            </Avatar>
            <span className="absolute bottom-[-1.7px] right-[-1.7px] h-[9px] w-[9px]">
              <span className="absolute inset-0 animate-ping rounded-full bg-kv-success/40 [animation-duration:2.4s]" />
              <span className="absolute inset-0 rounded-full border-[0.8px] border-white bg-kv-success" />
            </span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-[4px] whitespace-nowrap leading-none">
            <span className="truncate text-[13px] font-medium text-kv-fg">{name ?? "Pengguna"}</span>
            <span className="truncate text-[12px] text-kv-subtle">{email ?? ROLE_LABEL[role]}</span>
          </span>
          <ChevronsUpDown
            className="h-[18px] w-[18px] shrink-0 text-kv-secondary-fg transition-transform duration-200 group-hover/acct:scale-110"
            strokeWidth={1.5}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-[226px]">
        <DropdownMenuLabel>{ROLE_LABEL[role]}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/account">
            <UserCircle /> Akun saya
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/settings">
            <Settings /> Pengaturan
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-variant="destructive"
          onSelect={() => void signOut({ callbackUrl: "/login" })}
        >
          <LogOut /> Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
