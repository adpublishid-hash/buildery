"use client";

import { useEffect, useState } from "react";
import {
  Check,
  LayoutTemplate,
  Layers3,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Bentuk template yang dipakai dialog, sama untuk bawaan maupun kustom. */
export type TemplateSummary = {
  id: string;
  source: "builtin" | "custom";
  name: string;
  category: string;
  description: string;
  blockCount: number;
  previewImage: string | null;
  accentColor: string | null;
  highlights: string[];
};

export type TemplateImportPayload = {
  templateId: string;
  mode: "append" | "replace";
  /**
   * Ikut menerapkan tema template. Selalu pilihan eksplisit: tema berlaku ke
   * seluruh situs, jadi mengimpor ke satu halaman tidak boleh merestyle
   * halaman lain tanpa diminta.
   */
  applyTheme: boolean;
};

export function ImportTemplateDialog({
  hasBlocks,
  onImport,
}: {
  hasBlocks: boolean;
  onImport: (payload: TemplateImportPayload) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [mode, setMode] =
    useState<TemplateImportPayload["mode"]>("replace");
  const [applyTheme, setApplyTheme] = useState(false);

  // Daftarnya sekarang gabungan template bawaan dan yang dikurasi admin, jadi
  // hanya server yang tahu isinya.
  useEffect(() => {
    if (!open || templates.length > 0) return;
    setLoading(true);
    fetch("/api/dashboard/site-templates")
      .then((res) => res.json())
      .then((result) => {
        if (!result?.ok) throw new Error(result?.error);
        const list = result.data as TemplateSummary[];
        setTemplates(list);
        setSelectedId((current) => current || list[0]?.id || "");
      })
      .catch(() => toast.error("Gagal memuat daftar template."))
      .finally(() => setLoading(false));
  }, [open, templates.length]);

  const selected =
    templates.find((template) => template.id === selectedId) ?? templates[0];

  async function handleImport() {
    if (!selected) return;
    setImporting(true);
    try {
      const imported = await onImport({
        templateId: selected.id,
        mode: hasBlocks ? mode : "replace",
        applyTheme,
      });
      if (!imported) return;

      setOpen(false);
      setMode("replace");
      setApplyTheme(false);
      toast.success(`${selected.name} berhasil diimpor dan siap diedit.`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Import Template">
          <LayoutTemplate />
          <span className="hidden xl:inline">Import Template</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        {/* ── Header ── */}
        <DialogHeader className="shrink-0 border-b border-zinc-200 px-6 py-5 dark:border-zinc-800">
          <DialogTitle className="text-lg">Import Template</DialogTitle>
          <DialogDescription>
            Pilih template siap pakai. Setiap section akan menjadi block native
            yang bisa dipilih, dipindahkan, dan diedit dari builder.
          </DialogDescription>
        </DialogHeader>

        {/* ── Body ── */}
        <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_340px]">
          {/* Left: scrollable template list */}
          <div className="overflow-y-auto border-r border-zinc-100 px-6 py-5 dark:border-zinc-800">
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
              Template tersedia
            </p>
            {loading ? (
              <p className="flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Memuat template…
              </p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Belum ada template tersedia.
              </p>
            ) : null}
            <div className="space-y-4">
              {templates.map((template) => {
                const isSelected = template.id === selectedId;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedId(template.id)}
                    className={cn(
                      "group w-full overflow-hidden rounded-xl border bg-white text-left transition-all duration-200 dark:bg-zinc-950",
                      isSelected
                        ? "border-zinc-900 shadow-md ring-2 ring-zinc-900/5 dark:border-zinc-100 dark:ring-zinc-100/10"
                        : "border-zinc-200 shadow-sm hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:hover:border-zinc-700"
                    )}
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-[16/8] overflow-hidden bg-black">
                      {template.previewImage ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={template.previewImage}
                          alt={`Pratinjau ${template.name}`}
                          className="h-full w-full object-cover opacity-90 transition-transform duration-500 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-br from-zinc-700 to-zinc-900" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4">
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-white/60">
                            {template.category}
                          </p>
                          <p className="mt-0.5 text-xl font-semibold uppercase leading-tight tracking-tight text-white">
                            {template.name}
                          </p>
                        </div>
                        {isSelected && (
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-lg">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Card info */}
                    <div className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="mr-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                          {template.name}
                        </p>
                        <Badge variant="secondary" className="text-[11px]">
                          {template.category}
                        </Badge>
                        <Badge variant="outline" className="text-[11px]">
                          {template.blockCount} block
                        </Badge>
                        {template.source === "custom" ? (
                          <Badge className="text-[11px]">Kustom</Badge>
                        ) : null}
                        <Badge
                          variant="outline"
                          className="gap-1 text-[11px]"
                        >
                          <Sparkles className="h-3 w-3 text-amber-500" />
                          Motion
                        </Badge>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                        {template.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: sticky info panel */}
          <div className="flex flex-col gap-5 overflow-y-auto bg-zinc-50/50 px-5 py-5 dark:bg-zinc-900/30">
            {/* Feature card */}
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    Semua konten editable
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {selected?.description ??
                      "Setiap section menjadi block native yang bisa dipilih, dipindahkan, dan diedit."}
                  </p>
                </div>
              </div>

              {/* Highlights grid */}
              <div className="mt-3.5 grid grid-cols-2 gap-1.5">
                {(selected?.highlights ?? []).map((label) => (
                  <div
                    key={label}
                    className="flex items-center gap-1.5 rounded-lg bg-zinc-50 px-2.5 py-2 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                  >
                    <Check className="h-3 w-3 shrink-0 text-emerald-500" />
                    <span className="truncate">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tema template — opsional dan jelas cakupannya. */}
            <label className="flex items-start gap-2.5 rounded-xl border border-zinc-200 bg-white p-3 text-xs leading-5 dark:border-zinc-800 dark:bg-zinc-950">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={applyTheme}
                onChange={(event) => setApplyTheme(event.target.checked)}
              />
              <span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                  Terapkan juga tema template
                </span>
                <span className="block text-zinc-500 dark:text-zinc-400">
                  Warna dan tipografinya akan berlaku untuk{" "}
                  <strong>semua halaman</strong> di situs ini, bukan hanya
                  halaman ini.
                </span>
              </span>
            </label>

            {/* Import mode */}
            {hasBlocks ? (
              <fieldset className="space-y-2">
                <legend className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                  Cara impor
                </legend>
                <ImportMode
                  checked={mode === "replace"}
                  icon={LayoutTemplate}
                  title="Ganti layout saat ini"
                  description="Hapus block di canvas dan mulai dari template lengkap."
                  onChange={() => setMode("replace")}
                />
                <ImportMode
                  checked={mode === "append"}
                  icon={Layers3}
                  title="Tambahkan ke layout"
                  description="Pertahankan block saat ini lalu tambahkan template di bawahnya."
                  onChange={() => setMode("append")}
                />
              </fieldset>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs leading-5 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                Canvas masih kosong. Template akan menjadi layout awal halaman.
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50/80 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Batal
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleImport}
            disabled={!selected || importing}
          >
            {importing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <LayoutTemplate className="mr-1.5 h-3.5 w-3.5" />
            )}
            Import {selected?.name ?? "template"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImportMode({
  checked,
  icon: Icon,
  title,
  description,
  onChange,
}: {
  checked: boolean;
  icon: typeof LayoutTemplate;
  title: string;
  description: string;
  onChange: () => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-3.5 transition-all duration-150 dark:bg-zinc-950",
        checked
          ? "border-zinc-900 shadow-sm dark:border-zinc-100"
          : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
      )}
    >
      <input
        type="radio"
        name="template-import-mode"
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
          checked
            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </span>
        <span className="mt-0.5 block text-[11px] leading-4 text-zinc-500">
          {description}
        </span>
      </span>
    </label>
  );
}
