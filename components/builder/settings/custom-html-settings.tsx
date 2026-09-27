"use client";

import { useId, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

import type { CustomHtmlData } from "@/lib/blocks/schema";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AreaField, TextField, ToggleField } from "../fields";

export function CustomHtmlSettings({
  data,
  onChange,
}: {
  data: CustomHtmlData;
  onChange: (data: CustomHtmlData) => void;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const editorId = useId();
  const set = (patch: Partial<CustomHtmlData>) => onChange({ ...data, ...patch });
  const scripts = data.html.match(/<script\b/gi)?.length ?? 0;
  const handlers = data.html.match(/\son[a-z]+\s*=/gi)?.length ?? 0;

  const sourceEditor = (id: string, rows?: number) => (
    <Textarea
      id={id}
      value={data.html}
      onChange={(event) => set({ html: event.target.value })}
      rows={rows}
      spellCheck={false}
      className={rows ? "min-h-[22rem] resize-y whitespace-pre font-mono text-xs leading-5" : "min-h-0 flex-1 resize-none bg-white p-4 font-mono text-[13px] leading-6 dark:bg-zinc-900"}
    />
  );

  return (
    <>
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] leading-5 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
        Imported code runs in an isolated iframe. Scripts and browser permissions are off by default.
      </div>
      <TextField label="Block name" value={data.name} onChange={(name) => set({ name })} />
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={`${editorId}-inline`} className="text-xs font-medium">HTML, CSS &amp; JavaScript</label>
          <button type="button" onClick={() => setFullscreen(true)} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-zinc-200 px-2 text-[11px] font-medium" aria-label="Open HTML editor fullscreen">
            <Maximize2 className="h-3.5 w-3.5" /> Fullscreen
          </button>
        </div>
        {sourceEditor(`${editorId}-inline`, 18)}
        <p className="text-[10px] text-zinc-400">{data.html.split(/\r?\n/).length} lines · {data.html.length.toLocaleString()} characters · {scripts} scripts · {handlers} handlers</p>
      </div>
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="left-0 top-0 flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 sm:rounded-none">
          <DialogHeader className="shrink-0 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <DialogTitle>HTML, CSS &amp; JavaScript</DialogTitle>
            <DialogDescription>Edit the complete source. Changes apply immediately.</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col bg-zinc-50 p-4 dark:bg-zinc-950">{sourceEditor(`${editorId}-fullscreen`)}</div>
          <div className="flex justify-end border-t border-zinc-200 p-3 dark:border-zinc-800">
            <DialogClose className="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-medium text-white dark:bg-white dark:text-zinc-950"><Minimize2 className="h-4 w-4" /> Back to builder</DialogClose>
          </div>
        </DialogContent>
      </Dialog>
      <AreaField label="Base URL" value={data.baseUrl} onChange={(baseUrl) => set({ baseUrl })} rows={2} />
      <div className="grid grid-cols-2 gap-2">
        <ToggleField label="Run JavaScript" checked={data.allowScripts} onChange={(allowScripts) => set({ allowScripts })} />
        <ToggleField label="Auto height" checked={data.autoHeight} onChange={(autoHeight) => set({ autoHeight })} />
        <ToggleField label="Submit forms" checked={data.allowForms} onChange={(allowForms) => set({ allowForms })} />
        <ToggleField label="Open popups" checked={data.allowPopups} onChange={(allowPopups) => set({ allowPopups })} />
        <ToggleField label="Show modals" checked={data.allowModals} onChange={(allowModals) => set({ allowModals })} />
        <ToggleField label="Download files" checked={data.allowDownloads} onChange={(allowDownloads) => set({ allowDownloads })} />
        <ToggleField label="Presentation mode" checked={data.allowPresentation} onChange={(allowPresentation) => set({ allowPresentation })} />
      </div>
      <TextField label={data.autoHeight ? "Fallback height (px)" : "Height (px)"} value={String(data.height)} onChange={(value) => {
        if (!/^\d*$/.test(value)) return;
        set({ height: Math.min(4000, Math.max(100, Number(value) || 100)) });
      }} hint="Allowed range: 100-4000 px." />
    </>
  );
}
