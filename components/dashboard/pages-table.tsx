"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  CircleCheck,
  CircleDashed,
  Archive,
  ExternalLink,
  FileText,
  ListFilter,
  MoreHorizontal,
  PencilLine,
  Plus,
  Search,
  Settings2,
} from "lucide-react";
import type { PageStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { Panel } from "./panel";

export type PageRow = {
  id: string;
  title: string;
  slug: string;
  status: PageStatus;
  blocks: number;
  updatedAt: string;
  updatedAtTs: number;
  viewHref: string;
};

const STATUS: Record<PageStatus, { label: string; icon: typeof CircleCheck; tone: string }> = {
  PUBLISHED: { label: "Publish", icon: CircleCheck, tone: "text-kv-success" },
  DRAFT: { label: "Draft", icon: CircleDashed, tone: "text-kv-subtle" },
  ARCHIVED: { label: "Arsip", icon: Archive, tone: "text-kv-subtle" },
};

type SortKey = "title" | "status" | "blocks" | "updatedAtTs";
const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: "title", label: "Halaman" },
  { key: "status", label: "Status", className: "w-[150px]" },
  { key: "blocks", label: "Blok", className: "w-[110px]" },
  { key: "updatedAtTs", label: "Diperbarui", className: "w-[160px]" },
];

/** Recent pages in Kravio's table style: search, status filter, sortable columns. */
export function PagesTable({
  pages,
  canEdit,
  subtitle,
}: {
  pages: PageRow[];
  canEdit: boolean;
  subtitle: string;
}) {
  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<Set<PageStatus>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    let out = pages.filter(
      (p) =>
        (!q || `${p.title} ${p.slug}`.toLowerCase().includes(q)) &&
        (!statuses.size || statuses.has(p.status))
    );
    if (sort) {
      out = [...out].sort((a, b) => {
        const x = a[sort.key];
        const y = b[sort.key];
        const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "id");
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [pages, q, statuses, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (!s || s.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));

  const toggleStatus = (status: PageStatus) =>
    setStatuses((curr) => {
      const next = new Set(curr);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });

  return (
    <Panel
      id="pages"
      title={
        <>
          Halaman Website <span className="font-normal text-kv-muted-fg">· {subtitle}</span>
        </>
      }
      icon={FileText}
      iconPosition="left"
      className="w-full animate-kv-rise [animation-delay:340ms]"
      bodyClassName="border-0 bg-transparent"
      action={
        <div className="flex w-full items-start gap-[8px] sm:w-auto">
          <label className="flex h-[28px] min-w-0 flex-1 cursor-text items-center gap-[8px] overflow-clip rounded-[8px] border-[0.8px] border-kv-input bg-kv-card py-[8px] pl-[10px] pr-[8px] shadow-kv-soft transition-[border-color,box-shadow] duration-150 focus-within:border-[#9ca3af] focus-within:shadow-[0_0_0_3px_rgba(156,163,175,0.18)] hover:border-[#d1d5db] sm:w-[240px] sm:flex-none">
            <Search className="h-[16px] w-[16px] shrink-0 text-kv-secondary-fg" strokeWidth={1.6} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Halaman"
              aria-label="Cari halaman"
              className="min-w-0 flex-1 bg-transparent text-[13px] leading-none text-kv-fg outline-none placeholder:text-kv-muted-fg [&::-webkit-search-cancel-button]:hidden"
            />
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" className="group/f gap-[6px] pl-[8px] pr-[10px]">
                <ListFilter className="transition-transform duration-200 group-hover/f:translate-y-px" strokeWidth={1.6} />
                Filter
                {statuses.size > 0 ? (
                  <span className="kv-gradient kv-tabular -mr-[4px] ml-[2px] flex h-[16px] w-[16px] animate-kv-pop items-center justify-center rounded-full text-[10px] leading-none text-white">
                    {statuses.size}
                  </span>
                ) : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              {(Object.keys(STATUS) as PageStatus[]).map((status) => {
                const meta = STATUS[status];
                return (
                  <DropdownMenuCheckboxItem
                    key={status}
                    checked={statuses.has(status)}
                    onCheckedChange={() => toggleStatus(status)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <meta.icon className={cn("h-[16px] w-[16px]", meta.tone)} strokeWidth={1.8} />
                    {meta.label}
                  </DropdownMenuCheckboxItem>
                );
              })}
              {statuses.size > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setStatuses(new Set())}>Hapus filter</DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon" className="h-[28px] w-[28px] p-[6px]" aria-label="Aksi tabel">
                <MoreHorizontal strokeWidth={1.6} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canEdit ? (
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/pages/new">
                    <Plus /> Halaman baru
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild>
                <Link href="/dashboard/pages">
                  <FileText /> Semua halaman
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSort(null)} disabled={!sort}>
                <ArrowUpDown /> Reset urutan
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      <div className="relative w-full overflow-x-auto rounded-[10px] bg-kv-card p-[4px] shadow-[inset_0_0_0_0.8px_rgba(0,0,0,0.1)] [scrollbar-width:thin]">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              {COLUMNS.map((col, i) => {
                const on = sort?.key === col.key;
                return (
                  <th
                    key={col.key}
                    aria-sort={on ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={cn(
                      "h-[32px] border-y-[0.8px] border-black/[0.04] bg-kv-secondary px-[12px] font-normal",
                      i === 0 && "rounded-l-[8px] border-l-[0.8px]",
                      col.className
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className="group/th -mx-[4px] flex items-center gap-[12px] rounded px-[4px] outline-none focus-visible:ring-[3px] focus-visible:ring-kv-ring/40"
                    >
                      <span
                        className={cn(
                          "whitespace-nowrap text-[13px] leading-none transition-colors group-hover/th:text-kv-fg",
                          on ? "text-kv-fg" : "text-kv-secondary-fg"
                        )}
                      >
                        {col.label}
                      </span>
                      <ArrowUpDown
                        className={cn(
                          "h-[12px] w-[12px] shrink-0 text-kv-subtle transition-[transform,opacity,color] duration-200",
                          on && "text-kv-fg",
                          on && sort!.dir === "desc" && "rotate-180"
                        )}
                        strokeWidth={1.8}
                      />
                    </button>
                  </th>
                );
              })}
              <th className="h-[32px] w-[44px] rounded-r-[8px] border-y-[0.8px] border-r-[0.8px] border-black/[0.04] bg-kv-secondary">
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((page, i) => {
              const status = STATUS[page.status];
              const editHref = `/dashboard/pages/${page.id}/builder`;
              return (
                <tr
                  key={page.id}
                  className="group/row animate-kv-rise bg-kv-card transition-colors duration-150 hover:bg-kv-hover"
                  style={{ animationDelay: `${420 + i * 60}ms` }}
                >
                  <td className="h-[40px] border-b border-black/[0.06] px-[12px] py-[6px]">
                    <Link
                      href={canEdit ? editHref : page.viewHref}
                      className="flex min-w-0 flex-col gap-[3px] leading-none outline-none"
                    >
                      <span className="truncate text-[13px] font-medium text-kv-cell transition-colors group-hover/row:text-kv-fg">
                        {page.title}
                      </span>
                      <span className="truncate text-[12px] text-kv-subtle">/{page.slug}</span>
                    </Link>
                  </td>
                  <td className="border-b border-black/[0.06] px-[12px]">
                    <span className="flex items-center gap-[8px] whitespace-nowrap text-[13px] leading-none text-kv-cell">
                      <status.icon className={cn("h-[16px] w-[16px] animate-kv-pop", status.tone)} strokeWidth={1.8} />
                      {status.label}
                    </span>
                  </td>
                  <td className="kv-tabular whitespace-nowrap border-b border-black/[0.06] px-[12px] text-[13px] text-kv-cell">
                    {page.blocks} blok
                  </td>
                  <td className="whitespace-nowrap border-b border-black/[0.06] px-[12px] text-[13px] text-kv-cell">
                    {page.updatedAt}
                  </td>
                  <td className="border-b border-black/[0.06] px-[4px] text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Aksi untuk ${page.title}`}>
                          <MoreHorizontal strokeWidth={1.6} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel className="max-w-[200px] truncate normal-case tracking-normal">
                          {page.title}
                        </DropdownMenuLabel>
                        {canEdit ? (
                          <DropdownMenuItem asChild>
                            <Link href={editHref}>
                              <PencilLine /> Edit di builder
                            </Link>
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem asChild>
                          <Link href={page.viewHref} target="_blank">
                            <ExternalLink /> Lihat halaman
                          </Link>
                        </DropdownMenuItem>
                        {canEdit ? (
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/pages/${page.id}/settings`}>
                              <Settings2 /> Pengaturan halaman
                            </Link>
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <div className="flex h-[140px] animate-kv-fade flex-col items-center justify-center gap-[6px] text-center">
            <Search className="h-[16px] w-[16px] text-kv-secondary-fg opacity-50" />
            <p className="text-[13px] font-medium text-kv-fg">
              {pages.length === 0 ? "Belum ada halaman" : "Tidak ada halaman yang cocok"}
            </p>
            <p className="text-[12px] text-kv-muted-fg">
              {pages.length === 0
                ? "Buat halaman pertama, susun di builder, lalu publish."
                : "Ubah pencarian atau filter."}
            </p>
            {pages.length === 0 && canEdit ? (
              <Button asChild size="sm" className="mt-[4px]">
                <Link href="/dashboard/pages/new">
                  <Plus /> Buat halaman
                </Link>
              </Button>
            ) : pages.length > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                className="mt-[4px]"
                onClick={() => {
                  setQuery("");
                  setStatuses(new Set());
                }}
              >
                Reset
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
