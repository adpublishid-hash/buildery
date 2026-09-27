"use client";

import { useMemo, useRef, useState } from "react";
import { Code2, FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import {
  CUSTOM_HTML_MAX_BYTES,
  normalizeCustomHtmlBaseUrl,
} from "@/lib/blocks/custom-html";

export type HtmlImportPayload = {
  name: string;
  html: string;
  baseUrl: string;
  mode: "append" | "replace";
};

export function ImportHtmlDialog({
  hasBlocks,
  onImport,
}: {
  hasBlocks: boolean;
  onImport: (payload: HtmlImportPayload) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [name, setName] = useState("Imported HTML");
  const [html, setHtml] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [mode, setMode] = useState<HtmlImportPayload["mode"]>("append");

  const analysis = useMemo(() => {
    const scriptTags = html.match(/<script\b/gi)?.length ?? 0;
    const inlineHandlers = html.match(/\son[a-z]+\s*=/gi)?.length ?? 0;
    const styles = html.match(/<(?:style|link)\b/gi)?.length ?? 0;
    return { scriptTags, inlineHandlers, styles };
  }, [html]);

  function reset() {
    setName("Imported HTML");
    setHtml("");
    setBaseUrl("");
    setMode("append");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(file?: File) {
    if (!file) return;
    if (file.size > CUSTOM_HTML_MAX_BYTES) {
      toast.error("HTML file is too large. Maximum size is 1 MB.");
      return;
    }

    setReadingFile(true);
    try {
      const source = await file.text();
      setHtml(source);
      setName(file.name.replace(/\.html?$/i, "") || "Imported HTML");
    } catch {
      toast.error("Could not read the HTML file.");
    } finally {
      setReadingFile(false);
    }
  }

  function handleImport() {
    const source = html.trim();
    if (!source) {
      toast.error("Paste HTML or choose an HTML file first.");
      return;
    }
    if (new Blob([source]).size > CUSTOM_HTML_MAX_BYTES) {
      toast.error("HTML is too large. Maximum size is 1 MB.");
      return;
    }

    const normalizedBaseUrl = normalizeCustomHtmlBaseUrl(baseUrl);
    if (baseUrl.trim() && !normalizedBaseUrl) {
      toast.error("Base URL must be a valid http:// or https:// URL.");
      return;
    }

    onImport({
      name: name.trim() || "Imported HTML",
      html: source,
      baseUrl: normalizedBaseUrl,
      mode,
    });
    setOpen(false);
    reset();
    toast.success("HTML imported. JavaScript is enabled in a secure sandbox.");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Import HTML">
          <Code2 />
          <span className="hidden xl:inline">Import HTML</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import HTML</DialogTitle>
          <DialogDescription>
            Paste a fragment or a complete HTML document. CSS, external scripts,
            inline JavaScript, and event handlers are preserved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
            Imported JavaScript runs inside an isolated iframe. It can render and
            handle interactions, but cannot read Buildery login cookies or access
            the parent dashboard.
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="html-import-name" className="text-xs">Block name</Label>
              <Input
                id="html-import-name"
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">HTML file</Label>
              <input
                ref={fileRef}
                type="file"
                accept=".html,.htm,text/html"
                className="hidden"
                onChange={(event) => void handleFile(event.target.files?.[0])}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={readingFile}
                onClick={() => fileRef.current?.click()}
              >
                {readingFile ? <Loader2 className="animate-spin" /> : <FileUp />}
                {readingFile ? "Reading" : "Choose file"}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="html-import-source" className="text-xs">HTML source</Label>
              {html ? (
                <span className="text-[11px] text-zinc-400">
                  {analysis.scriptTags} script · {analysis.inlineHandlers} handler · {analysis.styles} style/link
                </span>
              ) : null}
            </div>
            <Textarea
              id="html-import-source"
              value={html}
              rows={16}
              spellCheck={false}
              placeholder={'<!doctype html>\n<html>\n  <body>...</body>\n  <script>...</script>\n</html>'}
              onChange={(event) => setHtml(event.target.value)}
              className="font-mono text-xs leading-5"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="html-import-base-url" className="text-xs">Base URL (optional)</Label>
            <Input
              id="html-import-base-url"
              type="url"
              value={baseUrl}
              placeholder="https://example.com/assets/"
              onChange={(event) => setBaseUrl(event.target.value)}
            />
            <p className="text-[11px] text-zinc-400">
              Required when the HTML uses relative image, stylesheet, script, or link URLs.
            </p>
          </div>

          {hasBlocks ? (
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Import mode</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <ImportMode
                  checked={mode === "append"}
                  title="Add as block"
                  description="Keep the current layout and add imported HTML at the end."
                  onChange={() => setMode("append")}
                />
                <ImportMode
                  checked={mode === "replace"}
                  title="Replace page"
                  description="Remove current blocks and use this HTML as the whole page."
                  onChange={() => setMode("replace")}
                />
              </div>
            </fieldset>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleImport} disabled={readingFile}>
            <Code2 /> Import HTML
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportMode({
  checked,
  title,
  description,
  onChange,
}: {
  checked: boolean;
  title: string;
  description: string;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <input type="radio" checked={checked} onChange={onChange} className="mt-0.5" />
      <span>
        <span className="block text-xs font-medium text-zinc-900 dark:text-zinc-50">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-zinc-500">{description}</span>
      </span>
    </label>
  );
}
