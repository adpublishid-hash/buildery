"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  ClipboardList,
  CornerDownLeft,
  FileText,
  Newspaper,
  Package,
  Plus,
  Search,
  ShoppingBag,
  Users,
} from "lucide-react";
import type { Role } from "@prisma/client";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { dashboardNav } from "@/components/dashboard/nav-config";
import type { NavItem } from "@/components/dashboard/nav-config";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const OPEN_COMMAND_PALETTE = "buildery:open-command-palette";
const OPEN_EVENT = OPEN_COMMAND_PALETTE;

type Command = {
  label: string;
  href: string;
  group: string;
  icon: LucideIcon;
  description?: string;
};

type RemoteCommand = {
  label: string;
  href: string;
  group: string;
  description?: string;
  icon: keyof typeof REMOTE_ICONS;
};

const QUICK_ACTIONS: Omit<Command, "icon" | "group">[] = [
  { label: "Halaman baru", href: "/dashboard/pages/new" },
  { label: "Produk baru", href: "/dashboard/products/new" },
  { label: "Kursus baru", href: "/dashboard/courses/new" },
  { label: "Post blog baru", href: "/dashboard/blog/new" },
  { label: "Form baru", href: "/dashboard/forms/new" },
];

const REMOTE_ICONS = {
  BookOpen,
  ClipboardList,
  FileText,
  Newspaper,
  Package,
  ShoppingBag,
  Users,
} as const;

/** ⌘K / Ctrl-K command palette — search nav and jump to quick actions. */
export function CommandPalette({ role }: { role: Role }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [remoteResults, setRemoteResults] = useState<RemoteCommand[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build the command list once per role.
  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = dashboardNav
      .flatMap((section) => section.items.flatMap((item) => flattenNavItem(item)))
      .filter((item) => !item.permission || can(role, item.permission))
      .map((item) => ({
        label: item.label,
        href: item.href,
        group: "Buka",
        icon: item.icon,
      }));
    const actions: Command[] = QUICK_ACTIONS.map((a) => ({
      ...a,
      group: "Buat",
      icon: Plus,
    }));
    return [...nav, ...actions];
  }, [role]);

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setRemoteResults([]);
      setRemoteLoading(false);
      setRemoteError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setRemoteLoading(true);
      setRemoteError(null);
      fetch(`/api/dashboard/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error("Search failed");
          const json = (await res.json()) as { results?: RemoteCommand[] };
          setRemoteResults(json.results ?? []);
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          console.error("[command-search]", error);
          setRemoteResults([]);
          setRemoteError("Pencarian data belum bisa dimuat.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setRemoteLoading(false);
        });
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  const results = useMemo<Command[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    const local = commands.filter((c) => c.label.toLowerCase().includes(q));
    const remote = remoteResults.map((item) => ({
      label: item.label,
      href: item.href,
      group: item.group,
      description: item.description,
      icon: REMOTE_ICONS[item.icon] ?? Search,
    }));
    const byHref = new Map<string, Command>();
    for (const command of [...local, ...remote]) {
      if (!byHref.has(command.href)) byHref.set(command.href, command);
    }
    return Array.from(byHref.values());
  }, [commands, query, remoteResults]);

  const showNoResults =
    results.length === 0 && !remoteLoading && query.trim().length >= 2;

  // Global ⌘K + custom open event.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    document.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  // Reset state each time it opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  function run(command: Command) {
    setOpen(false);
    router.push(command.href);
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[active];
      if (target) run(target);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[520px] gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Palet perintah</DialogTitle>

        <div className="flex items-center gap-[8px] border-b-[0.8px] border-kv-border px-[14px]">
          <Search className="h-[16px] w-[16px] shrink-0 text-kv-secondary-fg" strokeWidth={1.6} />
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Cari halaman, produk, aksi..."
            className="h-[46px] flex-1 bg-transparent text-[14px] text-kv-fg outline-none placeholder:text-kv-muted-fg"
          />
        </div>

        <div ref={listRef} className="max-h-[340px] overflow-y-auto p-[6px]">
          {remoteLoading ? (
            <p className="px-[10px] py-[8px] text-[12px] text-kv-subtle">
              Mencari data workspace...
            </p>
          ) : null}
          {remoteError ? (
            <p className="px-[10px] py-[8px] text-[12px] text-kv-secondary-fg">{remoteError}</p>
          ) : null}
          {showNoResults ? (
            <p className="px-[10px] py-[24px] text-center text-[13px] text-kv-muted-fg">
              Tidak ada hasil untuk &ldquo;{query}&rdquo;
            </p>
          ) : (
            results.map((command, i) => {
              const Icon = command.icon;
              return (
                <button
                  key={`${command.group}-${command.href}`}
                  type="button"
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(command)}
                  className={cn(
                    "flex w-full items-center gap-[10px] rounded-[8px] px-[8px] py-[8px] text-left text-[13px] leading-none transition-colors",
                    i === active
                      ? "bg-kv-accent text-kv-fg"
                      : "text-kv-secondary-fg"
                  )}
                >
                  <Icon className="h-[16px] w-[16px] shrink-0 text-kv-muted-fg" strokeWidth={1.6} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{command.label}</span>
                    {command.description ? (
                      <span className="mt-[6px] block truncate text-[12px] text-kv-subtle">
                        {command.description}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[11px] font-medium uppercase tracking-wide text-kv-subtle">
                    {command.group}
                  </span>
                  {i === active ? (
                    <CornerDownLeft className="h-[14px] w-[14px] text-kv-subtle" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function flattenNavItem(item: NavItem): NavItem[] {
  return [item, ...(item.children?.flatMap((child) => flattenNavItem(child)) ?? [])];
}
