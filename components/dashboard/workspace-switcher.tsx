"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, Plus, Search, Settings, Star } from "lucide-react";
import type { MemberRole, Workspace } from "@prisma/client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MEMBER_ROLE_LABEL } from "@/lib/permissions";
import { switchWorkspaceAction } from "@/lib/actions/current-workspace";
import { cn, getInitials } from "@/lib/utils";

export type WorkspaceOption = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  role: MemberRole;
  status: "ACTIVE" | "SUSPENDED" | "PENDING_DELETION";
  isFavorite: boolean;
};

type Props = {
  current: Pick<Workspace, "id" | "name" | "slug" | "logoUrl"> | null;
  currentRole?: MemberRole;
  options: WorkspaceOption[];
};

export function WorkspaceSwitcher({ current, currentRole, options }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const filtered = options.filter((option) => option.name.toLowerCase().includes(query.toLowerCase()) || option.slug.includes(query.toLowerCase()));

  function handleSelect(workspaceId: string) {
    if (workspaceId === current?.id) return;
    startTransition(async () => {
      const res = await switchWorkspaceAction(workspaceId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "group/ws flex w-full shrink-0 items-center justify-between gap-[8px] rounded-[10px] border-[0.8px] border-kv-border bg-kv-card py-[5px] pl-[5px] pr-[8px] text-left shadow-kv-soft outline-none transition-[box-shadow,transform] duration-200 hover:shadow-kv-hover focus-visible:ring-[3px] focus-visible:ring-kv-ring/40 active:scale-[0.99] data-[state=open]:shadow-kv-hover",
            pending && "opacity-60"
          )}
        >
          <span className="flex min-w-0 items-center gap-[8px]">
            <span className="kv-gradient flex h-[26px] w-[26px] shrink-0 items-center justify-center overflow-hidden rounded-[7px] text-[11px] font-semibold text-white">
              {current?.logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img loading="lazy" decoding="async"
                  src={current.logoUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                getInitials(current?.name ?? "My Landing")
              )}
            </span>
            <span className="flex min-w-0 flex-col gap-[4px] leading-none">
              <span className="truncate text-[13px] font-medium text-kv-fg">
                {current?.name ?? "Belum ada workspace"}
              </span>
              {currentRole ? (
                <span className="truncate text-[11px] text-kv-subtle">
                  {MEMBER_ROLE_LABEL[currentRole]}
                </span>
              ) : (
                <span className="truncate text-[11px] text-kv-subtle">
                  Pilih workspace
                </span>
              )}
            </span>
          </span>
          <ChevronsUpDown className="h-[16px] w-[16px] shrink-0 text-kv-secondary-fg transition-transform duration-200 group-hover/ws:scale-110" strokeWidth={1.5} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[226px]">
        <DropdownMenuLabel>
          Workspace
        </DropdownMenuLabel>
        <div className="relative px-[4px] pb-[4px]">
          <Search className="pointer-events-none absolute left-[14px] top-[9px] h-[14px] w-[14px] text-kv-muted-fg" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.stopPropagation()} placeholder="Cari workspace" className="h-[32px] pl-[30px]" />
        </div>
        {options.length === 0 ? (
          <div className="px-[8px] py-[12px] text-[12px] text-kv-muted-fg">
            Kamu belum tergabung di workspace mana pun.
          </div>
        ) : (
          filtered.map((opt) => (
            <DropdownMenuItem
              key={opt.id}
              onSelect={(e) => {
                e.preventDefault();
                handleSelect(opt.id);
              }}
              className="flex items-center gap-2"
            >
              <span className="kv-gradient flex h-[24px] w-[24px] shrink-0 items-center justify-center overflow-hidden rounded-[6px] text-[10px] font-semibold text-white">
                {opt.logoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img loading="lazy" decoding="async"
                    src={opt.logoUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  getInitials(opt.name)
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-[4px] leading-none">
                <span className="truncate text-[13px] text-kv-fg">{opt.name}</span>
                <span className="truncate text-[11px] text-kv-subtle">
                  {MEMBER_ROLE_LABEL[opt.role]} · {opt.status === "ACTIVE" ? "Aktif" : "Ditangguhkan"}
                </span>
              </span>
              {opt.isFavorite && <Star className="h-3.5 w-3.5 fill-current text-amber-500" />}
              {opt.id === current?.id && (
                <Check className="h-[14px] w-[14px] text-kv-fg" />
              )}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/workspaces/new">
            <Plus /> Workspace baru
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/workspaces">
            <Settings /> Kelola workspace
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function WorkspaceSwitcherSkeleton() {
  return (
    <Button
      variant="outline"
      className="w-full justify-between font-normal opacity-60"
      disabled
    >
      Memuat workspace...
    </Button>
  );
}
