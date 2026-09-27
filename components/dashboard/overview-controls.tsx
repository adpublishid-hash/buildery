"use client";

import Link from "next/link";
import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronDown, Globe, MoreVertical, RefreshCw, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const OVERVIEW_RANGES = [
  { value: "today", label: "Hari ini" },
  { value: "7d", label: "7 hari" },
  { value: "30d", label: "30 hari" },
] as const;

export type OverviewRange = (typeof OVERVIEW_RANGES)[number]["value"];

/** The period picker and ⋯ menu at the top right of the overview (Kravio). */
export function OverviewControls({
  range,
  publicHref,
}: {
  range: OverviewRange;
  publicHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/dashboard";
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const current = OVERVIEW_RANGES.find((r) => r.value === range) ?? OVERVIEW_RANGES[1];

  const select = (value: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (value === "7d") params.delete("range");
    else params.set("range", value);
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  return (
    <div className="flex items-center gap-[6px]">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("group/ps w-[118px] justify-between pl-[10px] pr-[8px]", pending && "opacity-60")}
            aria-label={`Periode: ${current.label}`}
          >
            <span className="flex items-center gap-[6px]">
              <CalendarDays strokeWidth={1.6} />
              <span key={current.value} className="animate-kv-fade">
                {current.label}
              </span>
            </span>
            <ChevronDown className="!h-[12px] !w-[12px] transition-transform duration-200 group-data-[state=open]/ps:rotate-180" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel>Periode</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={current.value} onValueChange={select}>
            {OVERVIEW_RANGES.map((r) => (
              <DropdownMenuRadioItem key={r.value} value={r.value}>
                {r.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-[28px] w-[28px] p-[6px]" aria-label="Opsi dashboard">
            <MoreVertical strokeWidth={1.6} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => startTransition(() => router.refresh())}>
            <RefreshCw /> Muat ulang data
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={publicHref} target="_blank">
              <Globe /> Lihat website
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/dashboard/settings">
              <Settings /> Pengaturan workspace
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
