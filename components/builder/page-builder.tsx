"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { PageStatus } from "@prisma/client";
import { toast } from "sonner";

import type { Block, BlockType } from "@/lib/blocks/schema";
import {
  extractSiteChrome,
  type SiteChrome,
  type SiteChromeBase,
} from "@/lib/site-chrome";
import { SiteChromeContext } from "./site-chrome-context";
import {
  canRedo,
  canUndo,
  EMPTY_HISTORY,
  pushHistory,
  redo as redoHistory,
  undo as undoHistory,
  type BuilderHistory,
} from "@/lib/builder/history";
import { defaultBlockData, newBlockId } from "@/lib/blocks/registry";
import { exportPageJson, parsePageJson } from "@/lib/builder/structure";

import { BlockSidebar } from "./block-sidebar";
import { StructurePanel } from "./structure-panel";
import { PageSettingsDialog } from "./page-settings-dialog";
import type { AiGeneratePayload } from "./ai-generate-dialog";
import { BuilderTopbar } from "./builder-topbar";
import { Canvas } from "./canvas";
import type { HtmlImportPayload } from "./import-html-dialog";
import type { TemplateImportPayload } from "./import-template-dialog";
import { ImportHtmlDialog } from "./import-html-dialog";
import { ImportTemplateDialog } from "./import-template-dialog";
import { pageBlocksSchema } from "@/lib/blocks/schema";
import type { BuilderDesignTokens } from "@/lib/builder-design-tokens";
import { Layers, Plus, SlidersHorizontal, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DesignTokensDialog,
  RevisionHistoryDialog,
  SavedSectionsDialog,
} from "./builder-tools";

const SettingsPanel = dynamic(
  () => import("./settings-panel").then((module) => module.SettingsPanel),
  {
    ssr: false,
    loading: () => (
      <div className="h-full animate-pulse bg-zinc-50 dark:bg-zinc-900" />
    ),
  }
);

export type PreviewDevice = "desktop" | "tablet" | "mobile";
export type BuilderFormOption = {
  id: string;
  slug: string;
  title: string;
  isOpen: boolean;
  fieldCount: number;
};

type Props = {
  page: {
    id: string;
    title: string;
    slug: string;
    status: PageStatus;
    seoTitle: string;
    metaDescription: string;
    ogImage: string;
    canonicalUrl: string;
    noindex: boolean;
    pixelEvent: string;
    customCss: string;
    editVersion: number;
    updatedAt: string;
  };
  initialBlocks: Block[];
  /**
   * Banyaknya blok yang sebagian isinya tidak valid saat dimuat dan sudah
   * dikembalikan ke default. Pemilik situs perlu tahu sebelum autosave menulis
   * versi yang sudah diperbaiki.
   */
  repairedBlockCount?: number;
  /** Header/footer situs yang dipakai bersama semua halaman. */
  siteChrome?: SiteChrome;
  /** Sidik jari versi situs saat builder dimuat, untuk kontrol konkurensi. */
  initialSiteChromeBase?: SiteChromeBase;
  accentColor?: string;
  initialDesignTokens: BuilderDesignTokens;
  formOptions?: BuilderFormOption[];
  /** False when the plan lacks the AI add-on or no API key is configured. */
  aiEnabled?: boolean;
  /** Custom CSS runs next to checkout; only branding.edit may change it. */
  canEditCss?: boolean;
  /** Pixels that receive the page's event, for the settings' status line. */
  pixelTargets?: string[];
};

type BuilderApiResult =
  | {
      ok: true;
      data?: {
        version?: number;
        savedAt?: string;
        siteChromeBase?: SiteChromeBase | null;
        siteChromeConflicts?: ("header" | "footer")[];
      };
    }
  | { ok: false; error: string; code?: string };

async function builderRequest(
  url: string,
  init: RequestInit
): Promise<BuilderApiResult> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const json = (await res.json().catch(() => null)) as
      | BuilderApiResult
      | null;

    if (!res.ok || !json?.ok) {
      if (json && !json.ok) return json;
      return {
        ok: false,
        error: `Request failed with status ${res.status}.`,
      };
    }

    return json;
  } catch {
    return {
      ok: false,
      error: "Could not reach the server. Please try again.",
    };
  }
}

export function PageBuilder({
  page,
  initialBlocks,
  repairedBlockCount = 0,
  siteChrome,
  initialSiteChromeBase,
  accentColor,
  initialDesignTokens,
  formOptions = [],
  aiEnabled = false,
  canEditCss = false,
  pixelTargets = [],
}: Props) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialBlocks[0]?.id ?? null
  );
  const [status, setStatus] = useState<PageStatus>(page.status);
  const [pageSettings, setPageSettings] = useState({
    title: page.title,
    slug: page.slug,
    status: page.status,
    seoTitle: page.seoTitle,
    metaDescription: page.metaDescription,
    ogImage: page.ogImage,
    canonicalUrl: page.canonicalUrl,
    noindex: page.noindex,
    pixelEvent: page.pixelEvent,
    customCss: page.customCss,
  });
  const [dirty, setDirty] = useState(false);
  const [version, setVersion] = useState(page.editVersion);
  const [saveState, setSaveState] = useState<"saved" | "unsaved" | "autosaving" | "conflict" | "offline">("saved");
  const [lastSavedAt, setLastSavedAt] = useState(page.updatedAt);
  const [designTokens, setDesignTokens] = useState(initialDesignTokens);
  const siteChromeBaseRef = useRef<SiteChromeBase>(initialSiteChromeBase ?? {});

  useEffect(() => {
    if (repairedBlockCount <= 0) return;
    toast.warning(
      `${repairedBlockCount} blok berisi pengaturan yang tidak valid dan sudah dikembalikan ke default. Periksa tampilannya sebelum terbit.`,
      { duration: 10000 }
    );
    // Sekali saat builder dibuka.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [siteChromeState, setSiteChromeState] = useState<SiteChrome>(
    siteChrome ?? { header: null, footer: null }
  );
  const [mobileBlocksOpen, setMobileBlocksOpen] = useState(false);
  // An empty page opens on the block list; otherwise on its structure.
  const [leftTab, setLeftTab] = useState<"structure" | "add">(
    initialBlocks.length > 0 ? "structure" : "add"
  );
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [recoveryBlocks, setRecoveryBlocks] = useState<Block[] | null>(null);
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  // Bumped to replay block entrance animations in the canvas. Starts at 0,
  // which renders blocks statically so normal editing is never interrupted.
  const [animationReplayToken, setAnimationReplayToken] = useState(0);
  const [history, setHistory] = useState<BuilderHistory>(EMPTY_HISTORY);
  const changeCounter = useRef(0);
  const savingRef = useRef(false);
  const revisionRestoreRef = useRef(false);
  const draftKey = `buildery:page-draft:${page.id}`;

  const selectedBlock = useMemo(
    () => blocks.find((b) => b.id === selectedId) ?? null,
    [blocks, selectedId]
  );

  function replayAnimations() {
    setAnimationReplayToken((token) => token + 1);
  }

  function markChanged() {
    changeCounter.current += 1;
    setDirty(true);
    setSaveState("unsaved");
  }

  /**
   * Every edit goes through here, so undo has a record of what it replaced.
   *
   * `label` groups a run of keystrokes in one field into a single step —
   * otherwise Ctrl+Z would walk back one character at a time.
   */
  function commit(next: (current: Block[]) => Block[], label: string) {
    setBlocks((current) => {
      setHistory((entries) => pushHistory(entries, current, label));
      return next(current);
    });
    markChanged();
  }

  function stepHistory(direction: "undo" | "redo") {
    const step =
      direction === "undo" ? undoHistory(history, blocks) : redoHistory(history, blocks);
    if (!step) return;

    setHistory(step.history);
    setBlocks(step.blocks);
    // The selected block may not exist in the state we stepped to.
    setSelectedId((current) =>
      step.blocks.some((block) => block.id === current) ? current : null
    );
    markChanged();
  }

  // Toast actions outlive the render that created them; they must undo
  // against the latest history, not the one captured before the commit.
  const stepHistoryRef = useRef(stepHistory);
  stepHistoryRef.current = stepHistory;

  function addBlock(type: BlockType) {
    const block = {
      id: newBlockId(),
      type,
      data: defaultBlockData(type),
    } as Block;
    commit((prev) => [...prev, block], "add");
    setSelectedId(block.id);
    setMobileBlocksOpen(false);
  }

  function importHtml(payload: HtmlImportPayload) {
    const block = {
      id: newBlockId(),
      type: "CUSTOM_HTML",
      data: {
        ...defaultBlockData("CUSTOM_HTML"),
        name: payload.name,
        html: payload.html,
        baseUrl: payload.baseUrl,
        allowScripts: false,
        allowForms: false,
        allowModals: false,
        allowPopups: false,
        allowDownloads: false,
        allowPresentation: false,
        autoHeight: true,
      },
    } as Block;

    commit(
      (prev) => (payload.mode === "replace" ? [block] : [...prev, block]),
      "import-html"
    );
    setSelectedId(block.id);
  }

  async function importTemplate(payload: TemplateImportPayload) {
    // Blok template sekarang datang dari server: template bawaan disusun di
    // kode, template kustom disimpan di database. Tombol WhatsApp sudah diisi
    // nomor bisnis workspace bila tersedia.
    let source: { type: Block["type"]; data: Block["data"] }[];
    let templateTokens: Partial<BuilderDesignTokens> | null = null;
    let whatsapp = { replaced: 0, remaining: 0 };
    try {
      const response = await fetch(
        `/api/dashboard/site-templates/${encodeURIComponent(payload.templateId)}`
      );
      const result = await response.json();
      if (!response.ok || !result?.ok) throw new Error(result?.error);
      source = result.data.blocks;
      templateTokens = result.data.designTokens ?? null;
      whatsapp = result.data.whatsapp ?? whatsapp;
    } catch {
      toast.error("Gagal memuat isi template.");
      return false;
    }

    const templateBlocks = source.map(
      (block) =>
        ({
          id: newBlockId(),
          type: block.type,
          data: block.data,
        }) as Block
    );

    if (
      payload.mode === "append" &&
      blocks.length + templateBlocks.length > 60
    ) {
      toast.error("Template melebihi batas maksimum 60 block pada halaman ini.");
      return false;
    }

    commit(
      (previous) =>
        payload.mode === "replace"
          ? templateBlocks
          : [...previous, ...templateBlocks],
      "import-template"
    );
    setSelectedId(templateBlocks[0]?.id ?? null);

    if (whatsapp.replaced > 0) {
      toast.success(
        `${whatsapp.replaced} tombol WhatsApp diisi nomor bisnismu. Periksa lagi sebelum terbit.`
      );
    } else if (whatsapp.remaining > 0) {
      // Penerbitan akan ditolak sampai nomornya diganti — katakan sekarang,
      // bukan saat pemilik situs menekan Terbit.
      toast.warning(
        `${whatsapp.remaining} tombol WhatsApp masih memakai nomor contoh. Atur nomor bisnismu di Integrasi → WhatsApp, atau ganti manual di tiap tombol.`
      );
    }

    // Tema berlaku ke seluruh situs, jadi hanya diterapkan bila diminta
    // secara eksplisit di dialog impor.
    if (payload.applyTheme && templateTokens) {
      const next = { ...designTokens, ...templateTokens };
      try {
        const response = await fetch(`/api/dashboard/pages/${page.id}/design-tokens`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        const result = await response.json();
        if (!response.ok || !result?.ok) throw new Error(result?.error);
        setDesignTokens(result.data);
        toast.success("Tema template diterapkan ke seluruh situs.");
      } catch {
        toast.error("Blok terimpor, tapi tema template gagal diterapkan.");
      }
    }
    return true;
  }

  /**
   * Applies AI-generated sections. Mirrors importTemplate: the model returns
   * block shapes without ids, so ids are minted here, and the same 60-block
   * ceiling applies — a long brief can otherwise blow past it in one go.
   */
  function generateWithAi(payload: AiGeneratePayload) {
    const generated = payload.blocks.map(
      (block) =>
        ({
          id: newBlockId(),
          type: block.type,
          data: block.data,
        }) as Block
    );

    if (payload.mode === "append" && blocks.length + generated.length > 60) {
      toast.error("Hasil AI melebihi batas maksimum 60 block pada halaman ini.");
      return false;
    }

    commit(
      (previous) => (payload.mode === "replace" ? generated : [...previous, ...generated]),
      "ai-generate"
    );
    setSelectedId(generated[0]?.id ?? null);
    return true;
  }

  function updateSelectedData(data: Block["data"]) {
    if (!selectedId) return;
    // Labelled per block, so typing into one field is a single undo step.
    commit(
      (prev) => prev.map((b) => (b.id === selectedId ? ({ ...b, data } as Block) : b)),
      `edit:${selectedId}`
    );
  }

  function moveBlock(id: string, direction: "up" | "down") {
    commit((prev) => {
      const index = prev.findIndex((b) => b.id === id);
      if (index === -1) return prev;
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    }, "move");
  }

  function duplicateBlock(id: string) {
    const source = blocks.find((b) => b.id === id);
    if (!source) return;
    const copy = {
      id: newBlockId(),
      type: source.type,
      data: JSON.parse(JSON.stringify(source.data)) as Block["data"],
    } as Block;
    commit((prev) => {
      const index = prev.findIndex((b) => b.id === id);
      if (index === -1) return prev;
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    }, "duplicate");
    setSelectedId(copy.id);
  }

  function removeBlock(id: string) {
    commit((prev) => prev.filter((b) => b.id !== id), "remove");
    setSelectedId((curr) => (curr === id ? null : curr));
  }

  function reorderBlock(
    draggedId: string,
    targetId: string,
    position: "before" | "after"
  ) {
    if (draggedId === targetId) return;
    commit((current) => {
      const from = current.findIndex((block) => block.id === draggedId);
      const target = current.findIndex((block) => block.id === targetId);
      if (from < 0 || target < 0) return current;
      const next = [...current];
      const [dragged] = next.splice(from, 1);
      const adjustedTarget = next.findIndex((block) => block.id === targetId);
      next.splice(adjustedTarget + (position === "after" ? 1 : 0), 0, dragged);
      return next;
    }, "reorder");
  }

  function clearBlocks() {
    commit(() => [], "clear");
    setSelectedId(null);
    toast.success("Halaman dikosongkan", {
      action: { label: "Undo", onClick: () => stepHistoryRef.current("undo") },
    });
  }

  function exportPage() {
    const blob = new Blob([exportPageJson(pageSettings.title, blocks)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${pageSettings.slug || "halaman"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function importPage(text: string) {
    if (!text) {
      toast.error("File terlalu besar (maksimal 2 MB).");
      return;
    }
    const parsed = parsePageJson(text);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    const imported = parsed.blocks.map((block) => ({ id: newBlockId(), ...block }) as Block);
    // Replacing is what the file means ("this page"); undo brings the old one back.
    commit(() => imported, "import-json");
    setSelectedId(imported[0]?.id ?? null);
    setLeftTab("structure");
    toast.success(
      `${imported.length} blok diimpor${parsed.skipped ? `, ${parsed.skipped} tipe tidak dikenal dilewati` : ""}.`,
      { action: { label: "Undo", onClick: () => stepHistoryRef.current("undo") } }
    );
  }

  /** Adds a header on top or a footer at the bottom, from the page settings. */
  function addChrome(part: "header" | "footer", useSite: boolean) {
    const type = part === "header" ? "HEADER" : "FOOTER";
    const shared = part === "header" ? siteChromeState.header : siteChromeState.footer;
    const data =
      useSite && shared
        ? { ...shared, siteWide: true }
        : { ...defaultBlockData(type), siteWide: false };
    const block = { id: newBlockId(), type, data } as Block;
    commit((prev) => (part === "header" ? [block, ...prev] : [...prev, block]), "add");
    setSelectedId(block.id);
  }

  const chromeActions = {
    onAdd: addChrome,
    onSelect: setSelectedId,
    onRemove: removeBlock,
    siteHas: { header: Boolean(siteChromeState.header), footer: Boolean(siteChromeState.footer) },
  };

  function insertSavedBlocks(saved: Block[]) {
    if (blocks.length + saved.length > 60) {
      toast.error("Reusable section exceeds the 60 block page limit.");
      return;
    }
    commit((current) => [...current, ...saved], "insert-section");
    setSelectedId(saved[0]?.id ?? null);
  }

  const serialize = useCallback(function serialize() {
    return blocks.map((b) => ({ type: b.type, data: b.data }));
  }, [blocks]);

  const saveBlocks = useCallback(function saveBlocks(source: "AUTOSAVE" | "MANUAL" | "PUBLISH" | "RESTORE") {
    return builderRequest(`/api/dashboard/pages/${page.id}/blocks`, {
      method: "PUT",
      body: JSON.stringify({
        blocks: serialize(),
        version,
        source,
        siteChromeBase: siteChromeBaseRef.current,
      }),
    });
  }, [page.id, serialize, version]);

  function setPageStatus(nextStatus: PageStatus) {
    return builderRequest(`/api/dashboard/pages/${page.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: nextStatus }),
    });
  }

  const persistBlocks = useCallback(async function persistBlocks(
    source: "AUTOSAVE" | "MANUAL" | "PUBLISH" | "RESTORE",
    notify = false
  ) {
    if (savingRef.current) return false;
    const startedAtChange = changeCounter.current;
    savingRef.current = true;
    setSaving(true);
    if (source === "AUTOSAVE") setSaveState("autosaving");
    try {
      const effectiveSource = revisionRestoreRef.current ? "RESTORE" : source;
      const res = await saveBlocks(effectiveSource);
      if (!res.ok) {
        if (res.code === "VERSION_CONFLICT") {
          setSaveState("conflict");
          toast.error("Save paused because this page changed elsewhere.");
        } else {
          setSaveState("offline");
          if (notify) toast.error(res.error);
        }
        return false;
      }
      if (typeof res.data?.version === "number") setVersion(res.data.version);
      if (res.data?.siteChromeBase) {
        siteChromeBaseRef.current = res.data.siteChromeBase;
        // Tanpa konflik, versi situs sekarang adalah yang baru disimpan dari
        // halaman ini; konteks form ikut diperbarui.
        if (!res.data.siteChromeConflicts?.length) {
          const written = extractSiteChrome(serialize() as Block[]);
          if (written.header || written.footer) {
            setSiteChromeState((previous) => ({
              header: written.header ?? previous.header,
              footer: written.footer ?? previous.footer,
            }));
          }
        }
      }
      if (res.data?.siteChromeConflicts?.length) {
        const parts = res.data.siteChromeConflicts
          .map((part) => (part === "header" ? "header" : "footer"))
          .join(" dan ");
        // Halaman tetap tersimpan; hanya versi situsnya yang tidak ditimpa.
        toast.warning(
          `Perubahan ${parts} situs tidak disimpan karena sudah diubah dari halaman lain. Muat ulang builder untuk melihat versi terbaru.`
        );
      }
      revisionRestoreRef.current = false;
      setLastSavedAt(res.data?.savedAt ?? new Date().toISOString());
      if (startedAtChange === changeCounter.current) {
        setDirty(false);
        setSaveState("saved");
        window.localStorage.removeItem(draftKey);
      } else {
        setSaveState("unsaved");
      }
      if (notify) toast.success("Layout saved");
      return true;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [draftKey, saveBlocks, serialize]);

  async function handleSave() {
    return persistBlocks("MANUAL", true);
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      const saved = dirty ? await persistBlocks("PUBLISH", false) : true;
      if (!saved) return false;
      const res = await setPageStatus("PUBLISHED");
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      setDirty(false);
      setStatus("PUBLISHED");
      setPageSettings((prev) => ({ ...prev, status: "PUBLISHED" }));
      toast.success("Page published");
      router.refresh();
      return true;
    } finally {
      setPublishing(false);
    }
  }

  async function handleUnpublish() {
    setPublishing(true);
    try {
      const res = await setPageStatus("DRAFT");
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      setStatus("DRAFT");
      setPageSettings((prev) => ({ ...prev, status: "DRAFT" }));
      toast.success("Page moved to draft");
      router.refresh();
      return true;
    } finally {
      setPublishing(false);
    }
  }

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(draftKey);
      if (!stored) return;
      const draft = JSON.parse(stored) as { updatedAt?: unknown; blocks?: unknown };
      if (typeof draft.updatedAt !== "number" || draft.updatedAt <= new Date(page.updatedAt).getTime()) return;
      if (!Array.isArray(draft.blocks)) return;
      const parsed = pageBlocksSchema.safeParse(
        draft.blocks.map((block) => ({
          type: (block as { type?: unknown }).type,
          data: (block as { data?: unknown }).data,
        }))
      );
      if (!parsed.success) return;
      setRecoveryBlocks(
        parsed.data.map((block, index) => ({
          ...block,
          id:
            typeof (draft.blocks as { id?: unknown }[])[index]?.id === "string"
              ? String((draft.blocks as { id?: unknown }[])[index].id)
              : newBlockId(),
        })) as Block[]
      );
    } catch {
      window.localStorage.removeItem(draftKey);
    }
  }, [draftKey, page.updatedAt]);

  useEffect(() => {
    if (!dirty) return;
    // Debounced: this used to serialise the whole page synchronously on every
    // keystroke, which on a long page is work done in the middle of typing.
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          draftKey,
          JSON.stringify({ updatedAt: Date.now(), version, blocks })
        );
      } catch {
        // Quota exceeded or storage blocked: the server autosave still runs.
      }
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [blocks, dirty, draftKey, version]);

  useEffect(() => {
    if (!dirty || saveState === "conflict") return;
    const timeout = window.setTimeout(() => {
      void persistBlocks("AUTOSAVE");
    }, 1800);
    return () => window.clearTimeout(timeout);
  }, [blocks, dirty, persistBlocks, saveState, version]);

  /**
   * The shortcuts anyone reaches for in an editor. Typing into a field must
   * never be intercepted, so anything originating in an input, textarea or
   * contentEditable is left alone — except the save shortcut, which is wanted
   * everywhere.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      const target = event.target as HTMLElement | null;
      const typing = Boolean(
        target?.closest?.("input, textarea, select, [contenteditable='true']")
      );

      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void persistBlocks("MANUAL", true);
        return;
      }

      if (mod && event.key.toLowerCase() === "z") {
        if (typing) return;
        event.preventDefault();
        stepHistory(event.shiftKey ? "redo" : "undo");
        return;
      }
      if (mod && event.key.toLowerCase() === "y") {
        if (typing) return;
        event.preventDefault();
        stepHistory("redo");
        return;
      }

      if (typing || !selectedId) return;

      if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateBlock(selectedId);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeBlock(selectedId);
        return;
      }
      if (event.key === "Escape") {
        setSelectedId(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    function warnBeforeLeave(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [dirty]);

  return (
    <SiteChromeContext.Provider value={siteChromeState}>
    <div className="flex h-full flex-col bg-white dark:bg-zinc-950">
      <BuilderTopbar
        pageTitle={pageSettings.title}
        pageId={page.id}
        pageSettings={{ ...pageSettings, status }}
        status={status}
        dirty={dirty}
        saveState={saveState}
        lastSavedAt={lastSavedAt}
        saving={saving}
        publishing={publishing}
        onSave={handleSave}
        onPublish={handlePublish}
        onUnpublish={handleUnpublish}
        onSettingsSaved={(next) => {
          setPageSettings(next);
          setStatus(next.status);
        }}
        previewDevice={previewDevice}
        onPreviewDeviceChange={setPreviewDevice}
        hasBlocks={blocks.length > 0}
        onImportHtml={importHtml}
        aiEnabled={aiEnabled}
        onGenerateWithAi={generateWithAi}
        onImportTemplate={importTemplate}
        onReplayAnimation={replayAnimations}
        canUndo={canUndo(history)}
        canRedo={canRedo(history)}
        onUndo={() => stepHistory("undo")}
        onRedo={() => stepHistory("redo")}
        selectedBlock={selectedBlock}
        blocks={blocks}
        designTokens={designTokens}
        onDesignTokensChange={setDesignTokens}
        onInsertSavedBlocks={insertSavedBlocks}
        chrome={chromeActions}
        canEditCss={canEditCss}
        pixelTargets={pixelTargets}
        onRestoreRevision={(restored) => {
          revisionRestoreRef.current = true;
          setBlocks(restored);
          setSelectedId(restored[0]?.id ?? null);
          markChanged();
        }}
      />
      {recoveryBlocks ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          <span>A newer browser draft was found for this page.</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => {
              window.localStorage.removeItem(draftKey);
              setRecoveryBlocks(null);
            }}>Discard</Button>
            <Button size="sm" onClick={() => {
              setBlocks(recoveryBlocks);
              setSelectedId(recoveryBlocks[0]?.id ?? null);
              setRecoveryBlocks(null);
              markChanged();
            }}>Restore draft</Button>
          </div>
        </div>
      ) : null}
      {saveState === "conflict" ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-900">
          <span>This page changed in another editor. Your local draft is preserved.</span>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>Load latest</Button>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-80 shrink-0 border-r border-zinc-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-950 md:block xl:w-[360px]">
          <LeftPanel
            tab={leftTab}
            onTabChange={setLeftTab}
            blockCount={blocks.length}
            structure={
              <StructurePanel
                blocks={blocks}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onMove={moveBlock}
                onReorder={reorderBlock}
                onDuplicate={duplicateBlock}
                onRemove={removeBlock}
                onClear={clearBlocks}
                onExport={exportPage}
                onImport={importPage}
                onAddBlocks={() => setLeftTab("add")}
              />
            }
            add={<BlockSidebar onAdd={addBlock} />}
          />
        </aside>

        <main className="min-w-0 flex-1">
          <Canvas
            blocks={blocks}
            selectedId={selectedId}
            accentColor={accentColor}
            designTokens={designTokens}
            previewDevice={previewDevice}
            animationReplayToken={animationReplayToken}
            onSelect={setSelectedId}
            onMove={moveBlock}
            onReorder={reorderBlock}
            onDuplicate={duplicateBlock}
            onRemove={removeBlock}
          />
        </main>

        <aside className="hidden w-80 shrink-0 border-l border-zinc-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-950 lg:block">
          <SettingsPanel
            block={selectedBlock}
            previewDevice={previewDevice}
            onPreviewDeviceChange={setPreviewDevice}
            onChange={updateSelectedData}
            formOptions={formOptions}
            onReplayAnimation={replayAnimations}
          />
        </aside>
      </div>
      <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 gap-2 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-lg dark:border-zinc-800 dark:bg-zinc-950 lg:hidden">
        <Button size="sm" variant="outline" onClick={() => setMobileBlocksOpen(true)}><Layers /> Struktur</Button>
        <Button size="sm" variant="outline" onClick={() => setMobileSettingsOpen(true)} disabled={!selectedBlock}><SlidersHorizontal /> Edit</Button>
        <Button size="icon" variant="outline" aria-label="Builder tools" onClick={() => setMobileToolsOpen(true)}><Wrench /></Button>
      </div>
      <Sheet open={mobileBlocksOpen} onOpenChange={setMobileBlocksOpen}>
        <SheetContent side="left" className="w-[92vw] max-w-sm p-0">
          <SheetHeader className="sr-only"><SheetTitle>Add blocks</SheetTitle></SheetHeader>
          <LeftPanel
            tab={leftTab}
            onTabChange={setLeftTab}
            blockCount={blocks.length}
            structure={
              <StructurePanel
                blocks={blocks}
                selectedId={selectedId}
                onSelect={(id) => {
                  setSelectedId(id);
                  setMobileBlocksOpen(false);
                }}
                onMove={moveBlock}
                onReorder={reorderBlock}
                onDuplicate={duplicateBlock}
                onRemove={removeBlock}
                onClear={clearBlocks}
                onExport={exportPage}
                onImport={importPage}
                onAddBlocks={() => setLeftTab("add")}
              />
            }
            add={<BlockSidebar onAdd={addBlock} />}
          />
        </SheetContent>
      </Sheet>
      <Sheet open={mobileSettingsOpen} onOpenChange={setMobileSettingsOpen}>
        <SheetContent side="right" className="w-[94vw] max-w-md p-0">
          <SheetHeader className="sr-only"><SheetTitle>Edit block</SheetTitle></SheetHeader>
          <SettingsPanel block={selectedBlock} previewDevice={previewDevice} onPreviewDeviceChange={setPreviewDevice} onChange={updateSelectedData} formOptions={formOptions} onReplayAnimation={replayAnimations} />
        </SheetContent>
      </Sheet>
      <Sheet open={mobileToolsOpen} onOpenChange={setMobileToolsOpen}>
        <SheetContent side="bottom" className="p-4">
          <SheetHeader><SheetTitle>Builder tools</SheetTitle></SheetHeader>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center sm:grid-cols-6 text-xs text-zinc-600">
            <div className="flex flex-col items-center gap-1"><RevisionHistoryDialog pageId={page.id} onRestore={(restored) => { revisionRestoreRef.current = true; setBlocks(restored); setSelectedId(restored[0]?.id ?? null); setMobileToolsOpen(false); markChanged(); }} /><span>History</span></div>
            <div className="flex flex-col items-center gap-1"><SavedSectionsDialog pageId={page.id} selectedBlock={selectedBlock} onInsert={(saved) => { insertSavedBlocks(saved); setMobileToolsOpen(false); }} /><span>Sections</span></div>
            <div className="flex flex-col items-center gap-1"><DesignTokensDialog pageId={page.id} value={designTokens} onChange={setDesignTokens} /><span>Styles</span></div>
            <div className="flex flex-col items-center gap-1"><ImportTemplateDialog hasBlocks={blocks.length > 0} onImport={async (payload) => { const result = await importTemplate(payload); if (result) setMobileToolsOpen(false); return result; }} /><span>Templates</span></div>
            <div className="flex flex-col items-center gap-1"><PageSettingsDialog triggerClassName="inline-flex" pageId={page.id} values={{ ...pageSettings, status }} status={status} dirty={dirty} blocks={blocks} chrome={{ ...chromeActions, onSelect: (id) => { setSelectedId(id); setMobileToolsOpen(false); } }} canEditCss={canEditCss} pixelTargets={pixelTargets} onSaved={(next) => { setPageSettings(next); setStatus(next.status); }} /><span>Halaman</span></div>
            <div className="flex flex-col items-center gap-1"><ImportHtmlDialog hasBlocks={blocks.length > 0} onImport={(payload) => { importHtml(payload); setMobileToolsOpen(false); }} /><span>HTML</span></div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
    </SiteChromeContext.Provider>
  );
}

/** Left column: the page's structure, or the blocks to add to it. */
function LeftPanel({
  tab,
  onTabChange,
  blockCount,
  structure,
  add,
}: {
  tab: "structure" | "add";
  onTabChange: (tab: "structure" | "add") => void;
  blockCount: number;
  structure: React.ReactNode;
  add: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Panel kiri" className="flex shrink-0 gap-[4px] border-b-[0.8px] border-kv-border p-[8px]">
        {(
          [
            { id: "structure", label: "Struktur", icon: Layers, badge: blockCount },
            { id: "add", label: "Tambah blok", icon: Plus, badge: null },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => onTabChange(item.id)}
            className={cn(
              "flex h-[30px] flex-1 items-center justify-center gap-[6px] rounded-[7px] text-[12px] font-medium transition-colors",
              tab === item.id
                ? "border-[0.8px] border-kv-border bg-kv-card text-kv-fg shadow-kv-active"
                : "text-kv-muted-fg hover:bg-kv-hover hover:text-kv-fg"
            )}
          >
            <item.icon className="h-[14px] w-[14px]" strokeWidth={1.8} />
            {item.label}
            {item.badge ? (
              <span className="kv-tabular rounded-[5px] bg-kv-secondary px-[5px] text-[10px] text-kv-muted-fg">{item.badge}</span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">{tab === "structure" ? structure : add}</div>
    </div>
  );
}
