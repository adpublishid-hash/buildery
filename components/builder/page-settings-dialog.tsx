"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PageStatus } from "@prisma/client";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ChevronRight,
  Code2,
  ExternalLink,
  FileText,
  Globe2,
  LayoutTemplate,
  Loader2,
  Lock,
  PanelBottom,
  PanelTop,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import type { Block } from "@/lib/blocks/schema";
import { PAGE_CSS_MAX, PAGE_PIXEL_EVENTS, unwrapStyleTag } from "@/lib/page-advanced";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/utils";
import { SeoImageUpload } from "@/components/pages/seo-image-upload";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type PageSettingsValues = {
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
};

type Section = "general" | "seo" | "chrome" | "pixel" | "css";

const SECTIONS: { id: Section; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "general", label: "Umum", hint: "Judul, URL, dan status terbit", icon: FileText },
  { id: "seo", label: "SEO", hint: "Tampilan di Google dan media sosial", icon: Search },
  { id: "chrome", label: "Header & Footer", hint: "Atur header dan footer halaman ini", icon: LayoutTemplate },
  { id: "pixel", label: "Meta Pixels", hint: "Tracking pixel & page event", icon: Zap },
  { id: "css", label: "Custom CSS", hint: "Gaya khusus halaman ini", icon: Code2 },
];

const GENERAL_FIELDS = ["title", "slug", "status"] as const;
const SEO_FIELDS = ["seoTitle", "metaDescription", "ogImage", "canonicalUrl", "noindex"] as const;
const ADVANCED_FIELDS = ["pixelEvent", "customCss"] as const;

const FIELD_SECTION: Record<string, Section> = {
  title: "general",
  slug: "general",
  status: "general",
  seoTitle: "seo",
  metaDescription: "seo",
  ogImage: "seo",
  canonicalUrl: "seo",
  noindex: "seo",
  pixelEvent: "pixel",
  customCss: "css",
};

type ApiResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function put(url: string, body: unknown): Promise<ApiResult> {
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as ApiResult | null;
    if (res.ok && json?.ok) return { ok: true };
    return json && !json.ok ? json : { ok: false, error: `Gagal menyimpan (status ${res.status}).` };
  } catch {
    return { ok: false, error: "Tidak bisa menghubungi server. Coba lagi." };
  }
}

export type ChromeActions = {
  /** Adds a header/footer block; `useSite` adopts the shared site version. */
  onAdd: (part: "header" | "footer", useSite: boolean) => void;
  onSelect: (blockId: string) => void;
  onRemove: (blockId: string) => void;
  /** Whether a shared site header/footer exists to adopt. */
  siteHas: { header: boolean; footer: boolean };
};

export function PageSettingsDialog({
  pageId,
  values,
  status,
  dirty,
  blocks,
  chrome,
  canEditCss,
  pixelTargets,
  onSaved,
  triggerClassName = "hidden sm:inline-flex",
}: {
  /** The trigger hides on phones in the topbar; the mobile tools sheet shows it. */
  triggerClassName?: string;
  pageId: string;
  values: PageSettingsValues;
  status: PageStatus;
  dirty: boolean;
  blocks: Block[];
  chrome: ChromeActions;
  canEditCss: boolean;
  pixelTargets: string[];
  onSaved: (values: PageSettingsValues) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<Section>("general");
  // On narrow screens the menu and a section take turns.
  const [showMenuMobile, setShowMenuMobile] = useState(true);
  const [draft, setDraft] = useState<PageSettingsValues>({ ...values, status });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, startSave] = useTransition();

  // Only on opening: `values` is a fresh object on every builder render
  // (autosave ticks), and resetting on each would wipe what is being typed.
  function handleOpenChange(next: boolean) {
    if (next) {
      setDraft({ ...values, status });
      setErrors({});
    }
    setOpen(next);
  }

  const changed = useMemo(() => {
    const base = { ...values, status };
    return (Object.keys(base) as (keyof PageSettingsValues)[]).filter((key) => base[key] !== draft[key]);
  }, [draft, values, status]);

  function set<K extends keyof PageSettingsValues>(key: K, value: PageSettingsValues[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function openSection(next: Section) {
    setSection(next);
    setShowMenuMobile(false);
  }

  function save() {
    const touchesPage = changed.some((key) => (GENERAL_FIELDS as readonly string[]).includes(key) || (SEO_FIELDS as readonly string[]).includes(key));
    const touchesAdvanced = changed.some((key) => (ADVANCED_FIELDS as readonly string[]).includes(key));

    startSave(async () => {
      const results: ApiResult[] = [];
      if (touchesPage) {
        // Every field is sent, canonical URL and noindex included: the route
        // treats a missing noindex as "off".
        results.push(
          await put(`/api/dashboard/pages/${pageId}/settings`, {
            title: draft.title,
            slug: draft.slug,
            status: draft.status,
            seoTitle: draft.seoTitle,
            metaDescription: draft.metaDescription,
            ogImage: draft.ogImage,
            canonicalUrl: draft.canonicalUrl,
            noindex: draft.noindex,
          })
        );
      }
      const pageSaved = !results.some((r) => !r.ok);
      if (touchesAdvanced && pageSaved) {
        results.push(
          await put(`/api/dashboard/pages/${pageId}/advanced`, {
            pixelEvent: draft.pixelEvent,
            ...(draft.customCss !== values.customCss ? { customCss: draft.customCss } : {}),
          })
        );
      }

      const failed = results.find((r): r is Extract<ApiResult, { ok: false }> => !r.ok);
      if (failed) {
        const fieldErrors = failed.fieldErrors ?? {};
        setErrors(fieldErrors);
        const first = Object.keys(fieldErrors)[0];
        if (first && FIELD_SECTION[first]) openSection(FIELD_SECTION[first]);
        toast.error(failed.error);
        return;
      }

      const saved = { ...draft, slug: slugify(draft.slug) };
      onSaved(saved);
      toast.success("Pengaturan halaman disimpan");
      setOpen(false);
      router.refresh();
    });
  }

  const current = SECTIONS.find((s) => s.id === section)!;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className={triggerClassName} aria-label="Pengaturan halaman" title="Pengaturan halaman">
          <Settings2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[min(680px,90vh)] max-w-[900px] flex-col gap-0 overflow-hidden p-0">
        <div className="border-b-[0.8px] border-kv-border px-[20px] py-[14px] pr-[48px]">
          <DialogTitle className="text-[15px] font-semibold text-kv-fg">Pengaturan halaman</DialogTitle>
          <DialogDescription className="mt-[2px] text-[12px] text-kv-muted-fg">
            Berlaku untuk halaman ini saja, kecuali yang ditandai &ldquo;situs&rdquo;.
          </DialogDescription>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav
            aria-label="Bagian pengaturan"
            className={cn(
              "w-full shrink-0 overflow-y-auto border-r-[0.8px] border-kv-border bg-kv-bg md:block md:w-[264px]",
              showMenuMobile ? "block" : "hidden"
            )}
          >
            {SECTIONS.map((item) => {
              const active = item.id === section;
              const hasError = Object.keys(errors).some((key) => FIELD_SECTION[key] === item.id);
              const hasChange = changed.some((key) => FIELD_SECTION[key] === item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openSection(item.id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex w-full items-center gap-[12px] border-b-[0.8px] border-kv-border px-[16px] py-[14px] text-left transition-colors",
                    active ? "md:bg-kv-card" : "hover:bg-black/[0.02]"
                  )}
                >
                  <item.icon className="h-[18px] w-[18px] shrink-0 text-kv-secondary-fg" strokeWidth={1.6} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-[6px] text-[14px] font-medium text-kv-fg">
                      {item.label}
                      {hasError ? (
                        <span className="h-[6px] w-[6px] rounded-full bg-kv-destructive" aria-label="ada kesalahan" />
                      ) : hasChange ? (
                        <span className="h-[6px] w-[6px] rounded-full bg-amber-500" aria-label="belum disimpan" />
                      ) : null}
                    </span>
                    <span className="mt-[2px] block text-[12px] leading-[1.4] text-kv-muted-fg">{item.hint}</span>
                  </span>
                  <ChevronRight className="h-[16px] w-[16px] shrink-0 text-kv-subtle transition-transform group-hover:translate-x-0.5" />
                </button>
              );
            })}
          </nav>

          <div className={cn("min-w-0 flex-1 flex-col md:flex", showMenuMobile ? "hidden" : "flex")}>
            <div className="flex items-center gap-[8px] border-b-[0.8px] border-kv-border px-[20px] py-[12px]">
              <button
                type="button"
                onClick={() => setShowMenuMobile(true)}
                className="-ml-[6px] rounded-[6px] p-[4px] text-kv-muted-fg hover:bg-kv-hover md:hidden"
                aria-label="Kembali ke menu"
              >
                <ArrowLeft className="h-[16px] w-[16px]" />
              </button>
              <current.icon className="h-[16px] w-[16px] text-kv-secondary-fg" strokeWidth={1.6} />
              <p className="text-[14px] font-medium text-kv-fg">{current.label}</p>
            </div>

            <div key={section} className="min-h-0 flex-1 animate-kv-fade overflow-y-auto px-[20px] py-[18px]">
              {section === "general" ? <GeneralSection draft={draft} set={set} errors={errors} dirty={dirty} /> : null}
              {section === "seo" ? <SeoSection draft={draft} set={set} errors={errors} /> : null}
              {section === "chrome" ? (
                <ChromeSection
                  blocks={blocks}
                  chrome={chrome}
                  onEdit={(id) => {
                    chrome.onSelect(id);
                    setOpen(false);
                  }}
                />
              ) : null}
              {section === "pixel" ? <PixelSection draft={draft} set={set} targets={pixelTargets} /> : null}
              {section === "css" ? <CssSection draft={draft} set={set} errors={errors} canEdit={canEditCss} /> : null}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-[12px] border-t-[0.8px] border-kv-border px-[20px] py-[12px]">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/dashboard/pages/${pageId}/settings`}>
              Pengaturan lengkap <ExternalLink />
            </Link>
          </Button>
          <div className="flex items-center gap-[10px]">
            {changed.length > 0 ? (
              <span className="hidden text-[12px] text-kv-muted-fg sm:inline">{changed.length} perubahan belum disimpan</span>
            ) : null}
            <Button size="sm" onClick={save} disabled={pending || changed.length === 0}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {pending ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

type SectionProps = {
  draft: PageSettingsValues;
  set: <K extends keyof PageSettingsValues>(key: K, value: PageSettingsValues[K]) => void;
  errors?: Record<string, string[]>;
};

function Field({
  label,
  htmlFor,
  hint,
  error,
  counter,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string;
  counter?: { value: number; max: number };
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-[6px]">
      <div className="flex items-center justify-between gap-[8px]">
        <Label htmlFor={htmlFor}>{label}</Label>
        {counter ? (
          <span className={cn("kv-tabular text-[11px]", counter.value > counter.max ? "text-kv-destructive" : "text-kv-subtle")}>
            {counter.value}/{counter.max}
          </span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p className="text-[12px] text-kv-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[12px] leading-[1.45] text-kv-muted-fg">{hint}</p>
      ) : null}
    </div>
  );
}

const STATUS_OPTIONS: { value: PageStatus; label: string; hint: string }[] = [
  { value: "DRAFT", label: "Draft", hint: "Hanya terlihat di builder dan pratinjau." },
  { value: "PUBLISHED", label: "Terbit", hint: "Tayang untuk semua pengunjung." },
  { value: "ARCHIVED", label: "Arsip", hint: "Disembunyikan tanpa dihapus." },
];

function GeneralSection({ draft, set, errors = {}, dirty }: SectionProps & { dirty: boolean }) {
  return (
    <div className="space-y-[16px]">
      {dirty ? (
        <p className="rounded-[8px] border-[0.8px] border-amber-200 bg-amber-50/70 px-[10px] py-[8px] text-[12px] text-amber-800">
          Perubahan blok belum tersimpan. Simpan layout secara terpisah dari tombol Save di atas.
        </p>
      ) : null}
      <Field label="Judul halaman" htmlFor="ps-title" error={errors.title?.[0]}>
        <Input id="ps-title" value={draft.title} maxLength={120} onChange={(e) => set("title", e.target.value)} />
      </Field>
      <Field
        label="URL halaman"
        htmlFor="ps-slug"
        error={errors.slug?.[0]}
        hint="Alamat lama tetap diarahkan ke alamat baru setelah diganti."
      >
        <div className="kv-field flex h-[32px] items-stretch overflow-hidden rounded-[8px] border-[0.8px] border-kv-border bg-kv-card focus-within:border-[#9ca3af] focus-within:shadow-[0_0_0_3px_rgba(156,163,175,0.18)]">
          <span className="flex items-center pl-[10px] text-[13px] text-kv-muted-fg">/</span>
          <input
            id="ps-slug"
            value={draft.slug}
            onChange={(e) => set("slug", e.target.value)}
            onBlur={(e) => set("slug", slugify(e.target.value))}
            className="min-w-0 flex-1 bg-transparent px-[2px] text-[13px] text-kv-fg outline-none"
          />
        </div>
      </Field>
      <Field label="Status" error={errors.status?.[0]}>
        <div role="radiogroup" aria-label="Status halaman" className="grid gap-[8px] sm:grid-cols-3">
          {STATUS_OPTIONS.map((option) => {
            const on = draft.status === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set("status", option.value)}
                className={cn(
                  "rounded-[8px] border-[0.8px] px-[10px] py-[8px] text-left transition-colors",
                  on ? "border-kv-fg bg-kv-card shadow-[inset_0_0_0_0.4px_#1f2937]" : "border-kv-border hover:bg-kv-hover"
                )}
              >
                <span className="flex items-center gap-[6px] text-[13px] font-medium text-kv-fg">
                  <span
                    className={cn(
                      "h-[7px] w-[7px] rounded-full",
                      option.value === "PUBLISHED" ? "bg-kv-success" : option.value === "DRAFT" ? "bg-amber-500" : "bg-kv-subtle"
                    )}
                  />
                  {option.label}
                </span>
                <span className="mt-[3px] block text-[11px] leading-[1.4] text-kv-muted-fg">{option.hint}</span>
              </button>
            );
          })}
        </div>
      </Field>
    </div>
  );
}

function SeoSection({ draft, set, errors = {} }: SectionProps) {
  const shownTitle = draft.seoTitle.trim() || draft.title;
  const shownDescription = draft.metaDescription.trim() || "Tambahkan meta description agar ringkasan halaman terkendali.";
  return (
    <div className="space-y-[16px]">
      <div className="rounded-[10px] border-[0.8px] border-kv-border bg-kv-secondary p-[12px]">
        <p className="text-[11px] uppercase tracking-[0.04em] text-kv-muted-fg">Pratinjau pencarian</p>
        <p className="mt-[8px] truncate text-[12px] text-kv-muted-fg">…/{slugify(draft.slug) || ""}</p>
        <p className="mt-[2px] truncate text-[16px] leading-[1.3] text-[#1a0dab]">{shownTitle}</p>
        <p className="mt-[4px] line-clamp-2 text-[12px] leading-[1.5] text-kv-cell">{shownDescription}</p>
        {draft.noindex ? (
          <p className="mt-[8px] flex items-center gap-[6px] text-[11px] font-medium text-amber-700">
            <Lock className="h-[12px] w-[12px]" /> Disembunyikan dari mesin pencari (noindex)
          </p>
        ) : null}
      </div>

      <Field label="Judul SEO" htmlFor="ps-seo-title" error={errors.seoTitle?.[0]} counter={{ value: draft.seoTitle.length, max: 70 }}>
        <Input id="ps-seo-title" value={draft.seoTitle} maxLength={70} placeholder={draft.title} onChange={(e) => set("seoTitle", e.target.value)} />
      </Field>
      <Field label="Meta description" htmlFor="ps-meta" error={errors.metaDescription?.[0]} counter={{ value: draft.metaDescription.length, max: 180 }}>
        <Textarea
          id="ps-meta"
          rows={3}
          maxLength={180}
          value={draft.metaDescription}
          placeholder="Ringkasan singkat untuk mesin pencari dan pratinjau media sosial."
          onChange={(e) => set("metaDescription", e.target.value)}
        />
      </Field>
      <Field label="Gambar share (OG image)" error={errors.ogImage?.[0]} hint="Tampil saat tautan dibagikan di WhatsApp, Facebook, dan X.">
        <SeoImageUpload value={draft.ogImage} onChange={(value) => set("ogImage", value)} />
      </Field>
      <Field
        label="Canonical URL"
        htmlFor="ps-canonical"
        error={errors.canonicalUrl?.[0]}
        hint="Isi hanya bila halaman ini salinan dari halaman lain."
      >
        <Input
          id="ps-canonical"
          value={draft.canonicalUrl}
          placeholder="https://"
          onChange={(e) => set("canonicalUrl", e.target.value)}
        />
      </Field>
      <label className="flex cursor-pointer items-start gap-[10px] rounded-[8px] border-[0.8px] border-kv-border px-[12px] py-[10px]">
        <input type="checkbox" className="mt-[2px]" checked={draft.noindex} onChange={(e) => set("noindex", e.target.checked)} />
        <span>
          <span className="block text-[13px] font-medium text-kv-fg">Sembunyikan dari mesin pencari</span>
          <span className="block text-[12px] text-kv-muted-fg">Halaman tetap bisa dibuka lewat tautan, tapi tidak masuk hasil Google.</span>
        </span>
      </label>
    </div>
  );
}

function ChromeSection({
  blocks,
  chrome,
  onEdit,
}: {
  blocks: Block[];
  chrome: ChromeActions;
  onEdit: (blockId: string) => void;
}) {
  const header = blocks.find((block) => block.type === "HEADER") ?? null;
  const footer = blocks.find((block) => block.type === "FOOTER") ?? null;

  return (
    <div className="space-y-[12px]">
      <p className="text-[13px] leading-[1.55] text-kv-muted-fg">
        Header dan footer <span className="font-medium text-kv-fg">situs</span> dipakai bersama semua halaman yang
        memilihnya; mengubahnya di satu halaman mengubah semuanya. Versi <span className="font-medium text-kv-fg">khusus halaman</span>{" "}
        hanya berlaku di sini. Perubahan di bagian ini langsung masuk ke layout dan bisa di-undo.
      </p>
      <ChromeCard part="header" icon={PanelTop} block={header} siteHas={chrome.siteHas.header} chrome={chrome} onEdit={onEdit} />
      <ChromeCard part="footer" icon={PanelBottom} block={footer} siteHas={chrome.siteHas.footer} chrome={chrome} onEdit={onEdit} />
    </div>
  );
}

function ChromeCard({
  part,
  icon: Icon,
  block,
  siteHas,
  chrome,
  onEdit,
}: {
  part: "header" | "footer";
  icon: LucideIcon;
  block: Block | null;
  siteHas: boolean;
  chrome: ChromeActions;
  onEdit: (blockId: string) => void;
}) {
  const name = part === "header" ? "Header" : "Footer";
  const siteWide = Boolean(block && (block.data as { siteWide?: boolean }).siteWide);

  return (
    <section className="kv-frame flex flex-col p-[4px]">
      <div className="flex items-center justify-between gap-[8px] px-[8px] py-[6px]">
        <span className="flex items-center gap-[6px] text-[13px] font-medium text-kv-secondary-fg">
          <Icon className="h-[14px] w-[14px]" strokeWidth={1.6} />
          {name}
        </span>
        {block ? (
          <span className="inline-flex h-[20px] items-center gap-[5px] rounded-[6px] border-[0.8px] border-kv-border bg-kv-card px-[6px] text-[11px] font-medium text-kv-secondary-fg">
            {siteWide ? <Globe2 className="h-[11px] w-[11px]" /> : null}
            {siteWide ? "Situs" : "Khusus halaman"}
          </span>
        ) : (
          <span className="text-[11px] text-kv-subtle">Tidak dipakai</span>
        )}
      </div>
      <div className="rounded-[10px] border-[0.8px] border-kv-border bg-kv-card p-[12px]">
        {block ? (
          <div className="flex flex-wrap items-center justify-between gap-[10px]">
            <p className="text-[12px] leading-[1.5] text-kv-muted-fg">
              {siteWide
                ? `Halaman ini memakai ${name.toLowerCase()} situs.`
                : `Halaman ini punya ${name.toLowerCase()} sendiri.`}
            </p>
            <div className="flex gap-[6px]">
              <Button size="sm" variant="outline" onClick={() => onEdit(block.id)}>
                <Pencil /> Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => chrome.onRemove(block.id)} aria-label={`Hapus ${name.toLowerCase()} dari halaman`}>
                <Trash2 /> Hapus
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-[10px]">
            <p className="text-[12px] leading-[1.5] text-kv-muted-fg">
              {part === "header" ? "Tanpa header, pengunjung tidak melihat navigasi di atas." : "Tanpa blok footer, footer bawaan situs yang tampil."}
            </p>
            <div className="flex gap-[6px]">
              {siteHas ? (
                <Button size="sm" onClick={() => chrome.onAdd(part, true)}>
                  <Globe2 /> Pakai {name.toLowerCase()} situs
                </Button>
              ) : null}
              <Button size="sm" variant={siteHas ? "outline" : "default"} onClick={() => chrome.onAdd(part, false)}>
                <Plus /> Buat baru
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function PixelSection({ draft, set, targets }: SectionProps & { targets: string[] }) {
  return (
    <div className="space-y-[14px]">
      {targets.length > 0 ? (
        <p className="flex items-start gap-[8px] rounded-[8px] border-[0.8px] border-kv-border bg-kv-secondary px-[10px] py-[8px] text-[12px] leading-[1.5] text-kv-muted-fg">
          <Zap className="mt-[2px] h-[13px] w-[13px] shrink-0 text-kv-success" />
          <span>
            Terhubung ke <span className="font-medium text-kv-fg">{targets.join(", ")}</span>. PageView sudah dikirim
            otomatis; event di bawah dikirim tambahan saat halaman ini dibuka, dan mengikuti izin cookie pengunjung.
          </span>
        </p>
      ) : (
        <p className="rounded-[8px] border-[0.8px] border-amber-200 bg-amber-50/70 px-[10px] py-[8px] text-[12px] leading-[1.5] text-amber-800">
          Belum ada pixel yang terpasang, jadi event belum terkirim ke mana pun.{" "}
          <Link href="/dashboard/settings/integrations" className="font-medium underline underline-offset-2">
            Pasang pixel di Integrasi
          </Link>
          .
        </p>
      )}

      <div role="radiogroup" aria-label="Event saat halaman dibuka" className="overflow-hidden rounded-[10px] border-[0.8px] border-kv-border">
        {[{ value: "", label: "Tidak ada", hint: "Hanya PageView." }, ...PAGE_PIXEL_EVENTS].map((event) => {
          const on = draft.pixelEvent === event.value;
          return (
            <button
              key={event.value || "none"}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => set("pixelEvent", event.value)}
              className={cn(
                "flex w-full items-center gap-[10px] border-b border-black/[0.06] px-[12px] py-[9px] text-left last:border-b-0 transition-colors",
                on ? "bg-kv-secondary" : "hover:bg-kv-hover"
              )}
            >
              <span
                className={cn(
                  "flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full border-[0.8px]",
                  on ? "border-kv-fg" : "border-kv-border"
                )}
              >
                {on ? <span className="kv-gradient h-[8px] w-[8px] rounded-full" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-kv-fg">{event.label}</span>
                <span className="block text-[12px] text-kv-muted-fg">{event.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CssSection({ draft, set, errors = {}, canEdit }: SectionProps & { canEdit: boolean }) {
  return (
    <div className="space-y-[12px]">
      <p className="text-[13px] leading-[1.55] text-kv-muted-fg">
        CSS ini hanya dimuat di halaman ini, di halaman publik dan pratinjau. Kanvas builder tidak memakainya, supaya
        tampilan editor tetap utuh. Setiap blok bisa ditarget dengan{" "}
        <code className="rounded-[4px] bg-kv-secondary px-[4px] py-[1px] font-mono text-[11px] text-kv-fg">[data-bd-block=&quot;hero&quot;]</code>,{" "}
        <code className="rounded-[4px] bg-kv-secondary px-[4px] py-[1px] font-mono text-[11px] text-kv-fg">[data-bd-block=&quot;faq&quot;]</code>, dan seterusnya.
      </p>
      <p className="text-[12px] leading-[1.55] text-kv-muted-fg">
        Warna teks blok diatur lewat variabel{" "}
        <code className="rounded-[4px] bg-kv-secondary px-[4px] py-[1px] font-mono text-[11px] text-kv-fg">--bd-block-text-color</code>{" "}
        pada bloknya — menulis <code className="font-mono text-[11px]">color</code> langsung di judul akan kalah oleh
        pengaturan warna blok.
      </p>
      {!canEdit ? (
        <p className="flex items-center gap-[8px] rounded-[8px] border-[0.8px] border-kv-border bg-kv-secondary px-[10px] py-[8px] text-[12px] text-kv-muted-fg">
          <Lock className="h-[13px] w-[13px] shrink-0" /> Hanya pemilik atau admin workspace yang bisa mengubah CSS kustom.
        </p>
      ) : null}
      <Field
        label="CSS"
        htmlFor="ps-css"
        error={errors.customCss?.[0]}
        counter={{ value: draft.customCss.length, max: PAGE_CSS_MAX }}
      >
        <Textarea
          id="ps-css"
          rows={14}
          spellCheck={false}
          readOnly={!canEdit}
          value={draft.customCss}
          placeholder={'[data-bd-block="hero"] {\n  --bd-block-text-color: #7c2d12;\n}\n\n[data-bd-block="hero"] h1 {\n  letter-spacing: -0.03em;\n}'}
          onChange={(e) => set("customCss", unwrapStyleTag(e.target.value))}
          className="max-w-none font-mono text-[12px] leading-[1.6]"
        />
      </Field>
    </div>
  );
}
