"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PageStatus } from "@prisma/client";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Monitor,
  Eye,
  Globe,
  Loader2,
  Smartphone,
  Play,
  Redo2,
  Undo2,
  Save,
  Tablet,
} from "lucide-react";

import type { PreviewDevice } from "./page-builder";
import type { Block } from "@/lib/blocks/schema";
import type { BuilderDesignTokens } from "@/lib/builder-design-tokens";
import { auditBuilderPage } from "@/lib/builder-audit";
import {
  AuditSummary,
  DesignTokensDialog,
  RevisionHistoryDialog,
  SavedSectionsDialog,
} from "./builder-tools";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { PageSettingsDialog, type ChromeActions, type PageSettingsValues } from "./page-settings-dialog";
import { AiGenerateDialog, type AiGeneratePayload } from "./ai-generate-dialog";
import { ImportHtmlDialog, type HtmlImportPayload } from "./import-html-dialog";
import {
  ImportTemplateDialog,
  type TemplateImportPayload,
} from "./import-template-dialog";

type Props = {
  pageTitle: string;
  pageId: string;
  pageSettings: PageSettingsValues;
  status: PageStatus;
  dirty: boolean;
  saveState: "saved" | "unsaved" | "autosaving" | "conflict" | "offline";
  lastSavedAt: string;
  saving: boolean;
  publishing: boolean;
  onSave: () => Promise<boolean>;
  onPublish: () => Promise<boolean>;
  onUnpublish: () => Promise<boolean>;
  onSettingsSaved: (values: PageSettingsValues) => void;
  previewDevice: PreviewDevice;
  onPreviewDeviceChange: (device: PreviewDevice) => void;
  hasBlocks: boolean;
  onImportHtml: (payload: HtmlImportPayload) => void;
  onImportTemplate: (payload: TemplateImportPayload) => Promise<boolean>;
  aiEnabled: boolean;
  onGenerateWithAi: (payload: AiGeneratePayload) => boolean;
  /** Replays every block entrance animation in the canvas. */
  onReplayAnimation: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  selectedBlock: Block | null;
  blocks: Block[];
  designTokens: BuilderDesignTokens;
  onDesignTokensChange: (tokens: BuilderDesignTokens) => void;
  onInsertSavedBlocks: (blocks: Block[]) => void;
  onRestoreRevision: (blocks: Block[]) => void;
  chrome: ChromeActions;
  canEditCss: boolean;
  pixelTargets: string[];
};

const STATUS_VARIANT: Record<
  PageStatus,
  "default" | "secondary" | "success" | "outline"
> = {
  DRAFT: "secondary",
  PUBLISHED: "success",
  ARCHIVED: "outline",
};

export function BuilderTopbar({
  pageTitle,
  pageId,
  pageSettings,
  status,
  dirty,
  saveState,
  lastSavedAt,
  saving,
  publishing,
  onSave,
  onPublish,
  onUnpublish,
  onSettingsSaved,
  previewDevice,
  onPreviewDeviceChange,
  hasBlocks,
  onImportHtml,
  onImportTemplate,
  aiEnabled,
  onGenerateWithAi,
  onReplayAnimation,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  selectedBlock,
  blocks,
  designTokens,
  onDesignTokensChange,
  onInsertSavedBlocks,
  onRestoreRevision,
  chrome,
  canEditCss,
  pixelTargets,
}: Props) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const busy = saving || publishing;
  const previewHref = `/dashboard/pages/${pageId}/preview`;
  const auditIssues = useMemo(
    () => auditBuilderPage(pageSettings, blocks),
    [blocks, pageSettings]
  );
  const hasPublishError = auditIssues.some((issue) => issue.level === "error");
  const saveLabel = {
    saved: `Saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    unsaved: "Unsaved changes",
    autosaving: "Autosaving...",
    conflict: "Save conflict",
    offline: "Saved locally; retrying",
  }[saveState];

  function openPreview() {
    window.open(previewHref, "_blank", "noopener,noreferrer");
  }

  async function handleSaveAndPreview() {
    const ok = await onSave();
    if (!ok) return;
    setPreviewOpen(false);
    openPreview();
  }

  async function handlePublishConfirm() {
    const ok =
      status === "PUBLISHED" ? await onUnpublish() : await onPublish();
    if (ok) setPublishOpen(false);
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-zinc-200/70 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex min-w-0 items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/dashboard/pages" aria-label="Back to pages">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {pageTitle}
          </p>
          <p className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                dirty ? "bg-amber-500" : "bg-emerald-500"
              )}
            />
            {saveLabel}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[status]} className="ml-1 hidden sm:inline-flex">
          {status.charAt(0) + status.slice(1).toLowerCase()}
        </Badge>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="hidden items-center rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-800 dark:bg-zinc-900 md:flex">
          <DeviceButton
            label="Desktop preview"
            active={previewDevice === "desktop"}
            onClick={() => onPreviewDeviceChange("desktop")}
          >
            <Monitor className="h-4 w-4" />
          </DeviceButton>
          <DeviceButton
            label="Tablet preview"
            active={previewDevice === "tablet"}
            onClick={() => onPreviewDeviceChange("tablet")}
          >
            <Tablet className="h-4 w-4" />
          </DeviceButton>
          <DeviceButton
            label="Mobile preview"
            active={previewDevice === "mobile"}
            onClick={() => onPreviewDeviceChange("mobile")}
          >
            <Smartphone className="h-4 w-4" />
          </DeviceButton>
        </div>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Undo (Ctrl+Z)"
            title="Undo · Ctrl+Z"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Redo (Ctrl+Shift+Z)"
            title="Redo · Ctrl+Shift+Z"
            disabled={!canRedo}
            onClick={onRedo}
          >
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="hidden sm:inline-flex"
          aria-label="Putar animasi block"
          title="Putar animasi block"
          disabled={!hasBlocks}
          onClick={onReplayAnimation}
        >
          <Play className="h-4 w-4" />
        </Button>
        <div className="hidden items-center xl:flex">
          <RevisionHistoryDialog pageId={pageId} onRestore={onRestoreRevision} />
          <SavedSectionsDialog pageId={pageId} selectedBlock={selectedBlock} onInsert={onInsertSavedBlocks} />
          <DesignTokensDialog pageId={pageId} value={designTokens} onChange={onDesignTokensChange} />
        </div>
        <div className="hidden items-center gap-1.5 lg:flex">
          {aiEnabled ? (
          <AiGenerateDialog hasBlocks={hasBlocks} onGenerate={onGenerateWithAi} />
        ) : null}
        <ImportTemplateDialog
            hasBlocks={hasBlocks}
            onImport={onImportTemplate}
          />
          <ImportHtmlDialog hasBlocks={hasBlocks} onImport={onImportHtml} />
        </div>
        <PageSettingsDialog
          pageId={pageId}
          values={pageSettings}
          status={status}
          dirty={dirty}
          blocks={blocks}
          chrome={chrome}
          canEditCss={canEditCss}
          pixelTargets={pixelTargets}
          onSaved={onSettingsSaved}
        />
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Eye /> Preview
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Preview page</DialogTitle>
              <DialogDescription>
                Preview opens the saved version of this page in a new tab.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {pageTitle}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      /{pageSettings.slug}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[status]}>
                    {status.charAt(0) + status.slice(1).toLowerCase()}
                  </Badge>
                </div>
              </div>

              {dirty ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                  You have unsaved layout changes. Save first to preview the latest version.
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">
                  The saved preview is up to date.
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={openPreview}>
                <ExternalLink /> Open saved preview
              </Button>
              {dirty ? (
                <Button type="button" onClick={handleSaveAndPreview} disabled={busy}>
                  {saving ? <Loader2 className="animate-spin" /> : <Save />}
                  {saving ? "Saving" : "Save & preview"}
                </Button>
              ) : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void onSave()}
          disabled={busy || !dirty}
        >
          {saving ? (
            <Loader2 className="animate-spin" />
          ) : dirty ? (
            <Save />
          ) : (
            <Check />
          )}
          {saving ? "Saving" : "Save"}
        </Button>
        <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
          <DialogTrigger asChild>
            {status === "PUBLISHED" ? (
              <Button variant="secondary" size="sm" disabled={busy}>
                {publishing ? <Loader2 className="animate-spin" /> : null}
                Unpublish
              </Button>
            ) : (
              <Button size="sm" disabled={busy}>
                {publishing ? <Loader2 className="animate-spin" /> : <Globe />}
                Publish
              </Button>
            )}
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {status === "PUBLISHED" ? "Unpublish page?" : "Publish page?"}
              </DialogTitle>
              <DialogDescription>
                {status === "PUBLISHED"
                  ? "Move this page back to draft. Visitors will no longer see the published page."
                  : "Save the latest layout and make this page available publicly."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {pageTitle}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      /{pageSettings.slug}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[status]}>
                    {status.charAt(0) + status.slice(1).toLowerCase()}
                  </Badge>
                </div>
                <div className="mt-4 grid gap-2 text-xs text-zinc-500">
                  <StatusRow
                    ok={!dirty}
                    label={dirty ? "Layout has unsaved changes" : "Layout is saved"}
                  />
                  <StatusRow
                    ok={Boolean(pageSettings.seoTitle || pageSettings.title)}
                    label={pageSettings.seoTitle ? "SEO title is set" : "Using page title for SEO"}
                  />
                  <StatusRow
                    ok={Boolean(pageSettings.metaDescription)}
                    label={
                      pageSettings.metaDescription
                        ? "Meta description is set"
                        : "Meta description is empty"
                    }
                  />
                </div>
              </div>

              {status !== "PUBLISHED" ? <AuditSummary issues={auditIssues} /> : null}

              {status !== "PUBLISHED" && dirty ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                  Publishing will save your current layout first.
                </div>
              ) : null}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" asChild>
                <Link href={`/dashboard/pages/${pageId}/settings`}>
                  Review settings
                </Link>
              </Button>
              <Button
                type="button"
                variant={status === "PUBLISHED" ? "secondary" : "default"}
                onClick={handlePublishConfirm}
                disabled={busy || (status !== "PUBLISHED" && hasPublishError)}
              >
                {publishing ? (
                  <Loader2 className="animate-spin" />
                ) : status === "PUBLISHED" ? null : (
                  <Globe />
                )}
                {publishing
                  ? status === "PUBLISHED"
                    ? "Unpublishing"
                    : "Publishing"
                  : status === "PUBLISHED"
                    ? "Unpublish"
                    : "Save & publish"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </header>
  );
}

function StatusRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded-full",
          ok
            ? "bg-emerald-100 text-emerald-700"
            : "bg-amber-100 text-amber-700"
        )}
      >
        {ok ? (
          <Check className="h-3 w-3" aria-hidden="true" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
        )}
      </span>
      <span>{label}</span>
    </div>
  );
}

function DeviceButton({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition",
        active
          ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
          : "hover:text-zinc-950 dark:hover:text-zinc-50"
      )}
    >
      {children}
    </button>
  );
}
