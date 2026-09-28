"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  Download,
  Eye,
  EyeOff,
  Globe2,
  GripVertical,
  Layers,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";

import type { Block } from "@/lib/blocks/schema";
import { BLOCK_REGISTRY } from "@/lib/blocks/registry";
import { blockOutline, blockSummary } from "@/lib/builder/structure";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Props = {
  blocks: Block[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onReorder: (draggedId: string, targetId: string, position: "before" | "after") => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onToggleHidden: (id: string) => void;
  onClear: () => void;
  onExport: () => void;
  onImport: (text: string) => void;
  onAddBlocks: () => void;
};

const VISIBILITY_LABEL: Record<string, string> = {
  desktop: "Hanya tampil di desktop",
  tablet: "Hanya tampil di tablet",
  mobile: "Hanya tampil di mobile",
  "desktop-tablet": "Disembunyikan di mobile",
  "tablet-mobile": "Disembunyikan di desktop",
};

/**
 * The page as a tree: one row per block, its lists (FAQ items, buttons…)
 * underneath. Selecting, reordering and removing here does exactly what the
 * canvas does, through the same undoable commits.
 */
export function StructurePanel({
  blocks,
  selectedId,
  onSelect,
  onMove,
  onReorder,
  onDuplicate,
  onRemove,
  onToggleHidden,
  onClear,
  onExport,
  onImport,
  onAddBlocks,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ id: string; position: "before" | "after" } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const outlines = useMemo(
    () => new Map(blocks.map((block) => [block.id, blockOutline(block)])),
    [blocks]
  );
  const expandable = blocks.filter((block) => (outlines.get(block.id)?.length ?? 0) > 0);
  const allOpen = expandable.length > 0 && expandable.every((block) => expanded.has(block.id));

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setExpanded(allOpen ? new Set() : new Set(expandable.map((block) => block.id)));
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-[8px] border-b-[0.8px] border-kv-border px-[14px] py-[10px]">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-kv-muted-fg">
          Struktur <span className="kv-tabular normal-case tracking-normal text-kv-subtle">· {blocks.length}/60</span>
        </p>
        <div className="flex items-center">
          <ToolButton label="Ekspor JSON" onClick={onExport} disabled={blocks.length === 0}>
            <Download />
          </ToolButton>
          <ToolButton label="Impor JSON" onClick={() => fileRef.current?.click()}>
            <Upload />
          </ToolButton>
          <span className="mx-[4px] h-[16px] w-px bg-kv-border" />
          <ToolButton label="Kosongkan halaman" onClick={() => setConfirmClear(true)} disabled={blocks.length === 0}>
            <Trash2 />
          </ToolButton>
          <span className="mx-[4px] h-[16px] w-px bg-kv-border" />
          <ToolButton label={allOpen ? "Lipat semua" : "Buka semua"} onClick={toggleAll} disabled={expandable.length === 0}>
            {allOpen ? <ChevronsDownUp /> : <ChevronsUpDown />}
          </ToolButton>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
              onImport("");
              return;
            }
            onImport(await file.text());
          }}
        />
      </div>

      <div className="border-b-[0.8px] border-dashed border-kv-border p-[12px]">
        <button
          type="button"
          onClick={onAddBlocks}
          className="flex h-[36px] w-full items-center justify-center gap-[8px] rounded-[8px] border-[0.8px] border-kv-border bg-kv-secondary text-[13px] font-medium text-kv-fg transition-colors hover:bg-kv-accent"
        >
          <Plus className="h-[15px] w-[15px]" /> Tambah blok
        </button>
      </div>

      {blocks.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-[8px] px-[24px] text-center">
          <Layers className="h-[20px] w-[20px] text-kv-subtle" strokeWidth={1.6} />
          <p className="text-[13px] font-medium text-kv-fg">Halaman masih kosong</p>
          <p className="text-[12px] leading-[1.5] text-kv-muted-fg">Tambahkan blok, pakai template, atau impor file JSON.</p>
        </div>
      ) : (
        <ul role="tree" aria-label="Struktur halaman" className="min-h-0 flex-1 space-y-[6px] overflow-y-auto p-[12px]">
          {blocks.map((block, index) => {
            const meta = BLOCK_REGISTRY[block.type];
            const Icon = meta.icon;
            const summary = blockSummary(block);
            const outline = outlines.get(block.id) ?? [];
            const open = expanded.has(block.id);
            const selected = block.id === selectedId;
            const siteWide = Boolean((block.data as { siteWide?: boolean }).siteWide);
            const visibility = block.data.style?.visibility ?? "all";
            const hidden = Boolean(block.data.style?.hidden);
            const hint = dropHint?.id === block.id ? dropHint.position : null;

            return (
              <li
                key={block.id}
                role="treeitem"
                aria-selected={selected}
                aria-expanded={outline.length > 0 ? open : undefined}
                className="relative"
              >
                {hint ? (
                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute inset-x-[18px] z-10 h-[2px] rounded-full bg-kv-fg",
                      hint === "before" ? "-top-[4px]" : "-bottom-[4px]"
                    )}
                  />
                ) : null}
                <div className="flex items-center gap-[4px]">
                  <button
                    type="button"
                    onClick={() => toggle(block.id)}
                    disabled={outline.length === 0}
                    aria-label={open ? "Lipat" : "Buka"}
                    className="flex h-[20px] w-[16px] shrink-0 items-center justify-center text-kv-muted-fg disabled:invisible"
                  >
                    {open ? <ChevronDown className="h-[14px] w-[14px]" /> : <ChevronRight className="h-[14px] w-[14px]" />}
                  </button>

                  <div
                    draggable
                    onDragStart={(event) => {
                      setDragId(block.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", block.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDropHint(null);
                    }}
                    onDragOver={(event) => {
                      if (!dragId || dragId === block.id) return;
                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
                      setDropHint((current) =>
                        current?.id === block.id && current.position === position ? current : { id: block.id, position }
                      );
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (dragId && dropHint) onReorder(dragId, dropHint.id, dropHint.position);
                      setDragId(null);
                      setDropHint(null);
                    }}
                    className={cn(
                      "group flex min-w-0 flex-1 items-center gap-[8px] rounded-[8px] border-[0.8px] bg-kv-card py-[6px] pl-[6px] pr-[6px] transition-[border-color,box-shadow,opacity]",
                      selected
                        ? "border-kv-fg shadow-[inset_0_0_0_0.4px_#1f2937]"
                        : "border-kv-border hover:border-[#d1d5db]",
                      dragId === block.id && "opacity-40",
                      hidden && "border-dashed"
                    )}
                  >
                    <GripVertical className="h-[14px] w-[14px] shrink-0 cursor-grab text-kv-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                    <button
                      type="button"
                      onClick={() => onSelect(block.id)}
                      className="flex min-w-0 flex-1 items-center gap-[8px] text-left outline-none"
                      title={summary ?? meta.label}
                    >
                      <Icon className="h-[15px] w-[15px] shrink-0 text-kv-secondary-fg" strokeWidth={1.6} />
                      <span className={cn("min-w-0 flex-1 truncate text-[13px] text-kv-fg", hidden && "text-kv-muted-fg line-through decoration-kv-subtle")}>
                        {summary ?? meta.label}
                        {summary ? (
                          <span className="ml-[6px] text-[11px] uppercase tracking-[0.02em] text-kv-subtle">
                            ({meta.label})
                          </span>
                        ) : null}
                      </span>
                    </button>

                    {siteWide ? (
                      <span title="Dipakai semua halaman" className="shrink-0 text-kv-muted-fg group-hover:hidden">
                        <Globe2 className="h-[13px] w-[13px]" />
                      </span>
                    ) : null}
                    {hidden ? (
                      <span title="Disembunyikan dari halaman publik" className="shrink-0 text-kv-muted-fg group-hover:hidden">
                        <EyeOff className="h-[13px] w-[13px]" />
                      </span>
                    ) : visibility !== "all" ? (
                      <span title={VISIBILITY_LABEL[visibility] ?? visibility} className="shrink-0 text-kv-muted-fg group-hover:hidden">
                        <EyeOff className="h-[13px] w-[13px]" />
                      </span>
                    ) : null}

                    <span className="hidden shrink-0 items-center group-focus-within:flex group-hover:flex">
                      <RowButton label="Naikkan" onClick={() => onMove(block.id, "up")} disabled={index === 0}>
                        <ArrowUp />
                      </RowButton>
                      <RowButton label="Turunkan" onClick={() => onMove(block.id, "down")} disabled={index === blocks.length - 1}>
                        <ArrowDown />
                      </RowButton>
                      <RowButton label={hidden ? "Tampilkan" : "Sembunyikan"} onClick={() => onToggleHidden(block.id)}>
                        {hidden ? <Eye /> : <EyeOff />}
                      </RowButton>
                      <RowButton label="Duplikat" onClick={() => onDuplicate(block.id)} disabled={blocks.length >= 60}>
                        <Copy />
                      </RowButton>
                      <RowButton label="Hapus" onClick={() => onRemove(block.id)}>
                        <Trash2 />
                      </RowButton>
                    </span>
                  </div>
                </div>

                {open ? (
                  <ul role="group" className="ml-[20px] mt-[6px] space-y-[6px] animate-kv-fade">
                    {outline.map((group) => (
                      <li key={group.key}>
                        <p className="px-[8px] pb-[4px] text-[11px] uppercase tracking-[0.04em] text-kv-subtle">
                          {group.label} · {group.items.length}
                        </p>
                        <ul className="space-y-[4px]">
                          {group.items.map((item, i) => (
                            <li key={`${group.key}-${i}`}>
                              <button
                                type="button"
                                onClick={() => onSelect(block.id)}
                                className="flex w-full items-center gap-[8px] rounded-[7px] border-[0.8px] border-kv-border bg-kv-card px-[8px] py-[5px] text-left text-[12px] text-kv-cell transition-colors hover:border-[#d1d5db]"
                              >
                                <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-kv-subtle/70" />
                                <span className="truncate">{item}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kosongkan halaman?</AlertDialogTitle>
            <AlertDialogDescription>
              Semua {blocks.length} blok dihapus dari halaman ini. Kamu masih bisa membatalkannya dengan Undo (Ctrl/⌘ + Z)
              atau memulihkan versi lama dari Riwayat.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={onClear}>Kosongkan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-[28px] w-[28px] items-center justify-center rounded-[6px] text-kv-secondary-fg transition-colors hover:bg-kv-hover hover:text-kv-fg disabled:opacity-40 disabled:hover:bg-transparent [&_svg]:h-[15px] [&_svg]:w-[15px]"
    >
      {children}
    </button>
  );
}

function RowButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-[22px] w-[22px] items-center justify-center rounded-[5px] text-kv-muted-fg transition-colors hover:bg-kv-hover hover:text-kv-fg disabled:opacity-30 [&_svg]:h-[13px] [&_svg]:w-[13px]"
    >
      {children}
    </button>
  );
}
