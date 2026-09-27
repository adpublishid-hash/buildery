"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  History,
  Library,
  Loader2,
  Palette,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import type { Block, BlockInput } from "@/lib/blocks/schema";
import { pageBlocksSchema } from "@/lib/blocks/schema";
import { newBlockId } from "@/lib/blocks/registry";
import {
  FONT_CHOICES,
  FONT_LABEL,
  type BuilderDesignTokens,
} from "@/lib/builder-design-tokens";
import type { BuilderAuditIssue } from "@/lib/builder-audit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Revision = {
  id: string;
  version: number;
  source: string;
  blocks: unknown;
  blockCount: number;
  createdAt: string;
  createdBy: { name: string | null; email: string };
};

type SavedSection = {
  id: string;
  name: string;
  blocks: unknown;
  blockCount: number;
  updatedAt: string;
};

function hydrateBlocks(value: unknown): Block[] | null {
  const parsed = pageBlocksSchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data.map(
    (block) => ({ ...block, id: newBlockId() }) as Block
  );
}

export function RevisionHistoryDialog({
  pageId,
  onRestore,
}: {
  pageId: string;
  onRestore: (blocks: Block[], version: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [revisions, setRevisions] = useState<Revision[]>([]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/dashboard/pages/${pageId}/revisions`)
      .then((response) => response.json())
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        setRevisions(result.data);
      })
      .catch((error) => toast.error(error.message || "Gagal memuat revisi."))
      .finally(() => setLoading(false));
  }, [open, pageId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Revision history" title="Revision history">
          <History className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Revision history</DialogTitle>
          <DialogDescription>Kembalikan tata letak yang tersimpan. Pengembalian ini ikut dicatat sebagai revisi baru.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : revisions.length ? (
          <div className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {revisions.map((revision) => (
              <div key={revision.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Versi {revision.version} · {REVISION_SOURCE_LABEL[revision.source] ?? revision.source.toLowerCase()}</p>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {revision.blockCount} blocks · {revision.createdBy.name || revision.createdBy.email} · {new Date(revision.createdAt).toLocaleString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const blocks = hydrateBlocks(revision.blocks);
                    if (!blocks) return toast.error("This revision contains invalid blocks.");
                    onRestore(blocks, revision.version);
                    setOpen(false);
                    toast.success(`Version ${revision.version} loaded. Save to apply it.`);
                  }}
                >
                  <RotateCcw /> Restore
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-zinc-500">No saved revisions yet.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SavedSectionsDialog({
  pageId,
  selectedBlock,
  onInsert,
}: {
  pageId: string;
  selectedBlock: Block | null;
  onInsert: (blocks: Block[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [sections, setSections] = useState<SavedSection[]>([]);

  const load = useCallback(async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/dashboard/pages/${pageId}/sections`);
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error);
      setSections(result.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memuat section.");
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  async function saveSelected() {
    if (!selectedBlock || name.trim().length < 2) return;
    setSaving(true);
    try {
      const block: BlockInput = { type: selectedBlock.type, data: selectedBlock.data } as BlockInput;
      const response = await fetch(`/api/dashboard/pages/${pageId}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), blocks: [block] }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error);
      setName("");
      toast.success("Reusable section saved.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save section.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(sectionId: string) {
    const response = await fetch(`/api/dashboard/pages/${pageId}/sections/${sectionId}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok || !result.ok) return toast.error(result.error || "Could not delete section.");
    setSections((current) => current.filter((item) => item.id !== sectionId));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Reusable sections" title="Reusable sections">
          <Library className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[82vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reusable sections</DialogTitle>
          <DialogDescription>Save the selected block or insert a workspace template.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Section name" maxLength={80} disabled={!selectedBlock} />
          <Button onClick={saveSelected} disabled={!selectedBlock || name.trim().length < 2 || saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Plus />} Save
          </Button>
        </div>
        {!selectedBlock ? <p className="text-xs text-amber-700">Select a block before saving a new section.</p> : null}
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : sections.length ? (
          <div className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {sections.map((section) => (
              <div key={section.id} className="flex items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{section.name}</p>
                  <p className="text-xs text-zinc-500">{section.blockCount} block{section.blockCount === 1 ? "" : "s"}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => {
                  const blocks = hydrateBlocks(section.blocks);
                  if (!blocks) return toast.error("This section contains invalid blocks.");
                  onInsert(blocks);
                  setOpen(false);
                }}>Insert</Button>
                <Button size="icon" variant="ghost" aria-label={`Delete ${section.name}`} onClick={() => void remove(section.id)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
        ) : <p className="py-6 text-center text-sm text-zinc-500">No reusable sections yet.</p>}
      </DialogContent>
    </Dialog>
  );
}

/** Label sumber revisi, supaya daftarnya terbaca dalam bahasa yang sama. */
const REVISION_SOURCE_LABEL: Record<string, string> = {
  AUTOSAVE: "simpan otomatis",
  MANUAL: "disimpan manual",
  PUBLISH: "terbit",
  RESTORE: "dikembalikan",
};

export function DesignTokensDialog({
  pageId,
  value,
  onChange,
}: {
  pageId: string;
  value: BuilderDesignTokens;
  onChange: (tokens: BuilderDesignTokens) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(value), [value]);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch(`/api/dashboard/pages/${pageId}/design-tokens`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error);
      onChange(result.data);
      setOpen(false);
      toast.success("Tema situs tersimpan. Berlaku untuk semua halaman.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan tema.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Tema situs" title="Tema situs (berlaku untuk semua halaman)"><Palette className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tema situs</DialogTitle>
          <DialogDescription>
            Warna, tipografi, dan sudut untuk seluruh halaman publik.
          </DialogDescription>
        </DialogHeader>
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Perubahan di sini berlaku untuk <strong>semua halaman</strong> di
          situs ini, bukan hanya halaman yang sedang kamu buka. Semua opsi
          lengkapnya ada di{" "}
          <a href="/dashboard/theme" className="font-medium underline">
            Pengaturan Tema
          </a>
          .
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["accentColor", "backgroundColor", "textColor"] as const).map((key) => (
            <div key={key} className="space-y-1.5">
              <Label>{key === "accentColor" ? "Accent" : key === "backgroundColor" ? "Background" : "Text"}</Label>
              <div className="flex gap-2">
                <input type="color" value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} className="h-9 w-11 rounded border border-zinc-200 bg-white p-1" />
                <Input value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} maxLength={7} />
              </div>
            </div>
          ))}
          <TokenSelect label="Heading font" value={draft.headingFont} onChange={(headingFont) => setDraft({ ...draft, headingFont })} />
          <TokenSelect label="Body font" value={draft.bodyFont} onChange={(bodyFont) => setDraft({ ...draft, bodyFont })} />
          <div className="space-y-1.5">
            <Label>Radius</Label>
            <select value={draft.radius} onChange={(event) => setDraft({ ...draft, radius: event.target.value as BuilderDesignTokens["radius"] })} className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
              <option value="none">None</option><option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option>
            </select>
          </div>
        </div>
        <DialogFooter><Button onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Palette />} Simpan untuk semua halaman</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TokenSelect({ label, value, onChange }: { label: string; value: BuilderDesignTokens["bodyFont"]; onChange: (value: BuilderDesignTokens["bodyFont"]) => void }) {
  return <div className="space-y-1.5"><Label>{label}</Label><select value={value} onChange={(event) => onChange(event.target.value as BuilderDesignTokens["bodyFont"])} className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">{FONT_CHOICES.map((font) => (<option key={font} value={font}>{FONT_LABEL[font]}</option>))}</select></div>;
}

export function AuditSummary({ issues }: { issues: BuilderAuditIssue[] }) {
  if (!issues.length) {
    return <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"><CheckCircle2 className="h-4 w-4" /> SEO and performance checks passed.</div>;
  }
  return (
    <div className="space-y-2">
      {issues.slice(0, 6).map((issue) => (
        <div key={issue.id} className={cn("flex items-start gap-2 rounded-lg border p-3 text-xs", issue.level === "error" ? "border-red-200 bg-red-50 text-red-800" : issue.level === "warning" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-zinc-200 bg-zinc-50 text-zinc-700")}>
          {issue.level === "info" ? <Clock3 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span><strong>{issue.label}.</strong> {issue.detail}</span>
        </div>
      ))}
      {issues.length > 6 ? <p className="text-xs text-zinc-500">And {issues.length - 6} more checks to review.</p> : null}
    </div>
  );
}
