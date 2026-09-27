"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, Monitor, Moon, RotateCcw, Sun } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { updateThemeTokensAction } from "@/lib/actions/theme";
import {
  CONTAINER_LABEL,
  FONT_CHOICES,
  FONT_LABEL,
  FONT_STACKS,
  RADIUS_LABEL,
  SPACING_LABEL,
  builderDesignTokenStyle,
  type BuilderDesignTokens,
} from "@/lib/builder-design-tokens";
import { darkModeVariables } from "@/lib/builder-dark-mode";
import { cn } from "@/lib/utils";

type Props = {
  tokens: BuilderDesignTokens;
  canEdit: boolean;
  /** Berapa situs yang ikut berubah, supaya cakupannya terbaca. */
  websiteCount: number;
};

type Tokens = BuilderDesignTokens;

const RADII: Tokens["radius"][] = ["none", "sm", "md", "lg"];
const RADIUS_PX: Record<Tokens["radius"], number> = { none: 0, sm: 4, md: 8, lg: 12 };
const SPACINGS: Tokens["spacing"][] = ["compact", "normal", "roomy"];
const WIDTHS: Tokens["containerWidth"][] = ["narrow", "normal", "wide"];

const SCHEMES: { value: Tokens["colorScheme"]; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Terang", icon: Sun },
  { value: "dark", label: "Gelap", icon: Moon },
  { value: "auto", label: "Ikuti perangkat", icon: Monitor },
];

/** One click sets the three colours; each stays editable afterwards. */
const PALETTES: { name: string; accent: string; background: string; text: string }[] = [
  { name: "Monokrom", accent: "#18181b", background: "#ffffff", text: "#18181b" },
  { name: "Samudra", accent: "#1d4ed8", background: "#f8fafc", text: "#0f172a" },
  { name: "Hutan", accent: "#15803d", background: "#f7faf7", text: "#14271a" },
  { name: "Senja", accent: "#ea580c", background: "#fffaf5", text: "#2b1a0e" },
  { name: "Anggur", accent: "#7c3aed", background: "#faf8ff", text: "#1e1533" },
  { name: "Mawar", accent: "#e11d48", background: "#fff7f8", text: "#2a0f16" },
];

const TOKEN_KEYS = [
  "accentColor",
  "backgroundColor",
  "textColor",
  "headingFont",
  "bodyFont",
  "radius",
  "spacing",
  "containerWidth",
  "colorScheme",
  "darkBackgroundColor",
  "darkSurfaceColor",
  "darkTextColor",
] as const satisfies readonly (keyof Tokens)[];

const HEX = /^#[0-9a-f]{6}$/i;

/** WCAG relative-luminance contrast between two #rrggbb colours. */
function contrast(a: string, b: string) {
  if (!HEX.test(a) || !HEX.test(b)) return null;
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Token desain berlaku untuk seluruh halaman publik, jadi tempatnya di sini —
 * bukan tersembunyi di dalam builder satu halaman, di mana mengubah warna
 * terasa seperti mengubah halaman itu saja.
 */
export function ThemeTokensForm({ tokens, canEdit, websiteCount }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Tokens>(tokens);
  const [previewDark, setPreviewDark] = useState(tokens.colorScheme === "dark");

  const dirty = TOKEN_KEYS.some((key) => draft[key] !== tokens[key]);
  const showDark = draft.colorScheme === "dark" || (draft.colorScheme === "auto" && previewDark);

  const warnings = useMemo(() => {
    const list: string[] = [];
    const text = contrast(draft.textColor, draft.backgroundColor);
    if (text !== null && text < 4.5) list.push(`Teks di atas latar kurang kontras (${text.toFixed(1)}:1, disarankan ≥ 4,5:1).`);
    const button = contrast("#ffffff", draft.accentColor);
    if (button !== null && button < 3) list.push(`Tulisan putih di tombol aksen sulit dibaca (${button.toFixed(1)}:1). Pilih aksen yang lebih gelap.`);
    if (draft.colorScheme !== "light") {
      const dark = contrast(draft.darkTextColor, draft.darkBackgroundColor);
      if (dark !== null && dark < 4.5) list.push(`Mode gelap: teks kurang kontras (${dark.toFixed(1)}:1).`);
    }
    return list;
  }, [draft]);

  function set<K extends keyof Tokens>(key: K, value: Tokens[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await updateThemeTokensAction(formData);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Tema situs tersimpan");
      router.refresh();
    });
  }

  const activePalette = PALETTES.find(
    (p) => p.accent === draft.accentColor.toLowerCase() && p.background === draft.backgroundColor.toLowerCase() && p.text === draft.textColor.toLowerCase()
  );

  return (
    <form action={onSubmit} className="kv-editor">
      {/* Every token travels as a hidden field; the controls only edit the draft. */}
      {TOKEN_KEYS.map((key) => (
        <input key={key} type="hidden" name={key} value={draft[key]} />
      ))}

      <fieldset disabled={!canEdit} className="grid min-w-0 gap-[16px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-[20px]">
          <Group title="Warna" hint="Mulai dari palet, lalu sesuaikan tiap warna.">
            <div className="flex flex-wrap gap-[6px]">
              {PALETTES.map((palette) => {
                const on = activePalette?.name === palette.name;
                return (
                  <button
                    key={palette.name}
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        accentColor: palette.accent,
                        backgroundColor: palette.background,
                        textColor: palette.text,
                      }))
                    }
                    aria-pressed={on}
                    className={cn(
                      "flex h-[32px] items-center gap-[8px] rounded-[8px] border-[0.8px] bg-kv-card pl-[6px] pr-[10px] text-[12px] font-medium transition-colors",
                      on ? "border-kv-fg text-kv-fg" : "border-kv-border text-kv-secondary-fg hover:bg-kv-hover"
                    )}
                  >
                    <span className="flex overflow-hidden rounded-[5px] border-[0.8px] border-black/10">
                      <span className="h-[18px] w-[9px]" style={{ backgroundColor: palette.background }} />
                      <span className="h-[18px] w-[9px]" style={{ backgroundColor: palette.accent }} />
                      <span className="h-[18px] w-[9px]" style={{ backgroundColor: palette.text }} />
                    </span>
                    {palette.name}
                    {on ? <Check className="h-[12px] w-[12px]" /> : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-[12px] grid gap-[12px] sm:grid-cols-3">
              <ColorField label="Aksen" hint="Tombol & tautan" value={draft.accentColor} onChange={(v) => set("accentColor", v)} />
              <ColorField label="Latar" hint="Latar halaman" value={draft.backgroundColor} onChange={(v) => set("backgroundColor", v)} />
              <ColorField label="Teks" hint="Judul & paragraf" value={draft.textColor} onChange={(v) => set("textColor", v)} />
            </div>
            {warnings.length > 0 ? (
              <ul className="mt-[10px] space-y-[4px]">
                {warnings.map((warning) => (
                  <li key={warning} className="flex items-start gap-[6px] text-[12px] leading-[1.45] text-amber-800">
                    <AlertTriangle className="mt-[2px] h-[12px] w-[12px] shrink-0" />
                    {warning}
                  </li>
                ))}
              </ul>
            ) : null}
          </Group>

          <Group title="Tipografi" hint="Hanya font yang sudah ada di perangkat pengunjung, jadi halaman tetap cepat.">
            <FontPicker label="Font judul" value={draft.headingFont} onChange={(v) => set("headingFont", v)} heading />
            <FontPicker label="Font isi" value={draft.bodyFont} onChange={(v) => set("bodyFont", v)} />
          </Group>

          <Group title="Bentuk & ruang">
            <div className="grid gap-[14px] md:grid-cols-3">
              <Segmented
                label="Sudut"
                value={draft.radius}
                options={RADII.map((r) => ({
                  value: r,
                  label: RADIUS_LABEL[r],
                  icon: (
                    <span
                      className="h-[12px] w-[12px] border-l-[1.5px] border-t-[1.5px] border-current"
                      style={{ borderTopLeftRadius: RADIUS_PX[r] }}
                    />
                  ),
                }))}
                onChange={(v) => set("radius", v)}
              />
              <Segmented
                label="Jarak antar section"
                value={draft.spacing}
                options={SPACINGS.map((s) => ({ value: s, label: SPACING_LABEL[s] }))}
                onChange={(v) => set("spacing", v)}
              />
              <Segmented
                label="Lebar konten"
                value={draft.containerWidth}
                options={WIDTHS.map((w) => ({ value: w, label: CONTAINER_LABEL[w] }))}
                onChange={(v) => set("containerWidth", v)}
              />
            </div>
          </Group>

          <Group title="Mode warna" hint="Mode gelap memakai warna di bawah; halaman dan blok tidak perlu diubah.">
            <Segmented
              label="Mode warna halaman publik"
              hideLabel
              value={draft.colorScheme}
              options={SCHEMES.map((s) => ({
                value: s.value,
                label: s.label,
                icon: <s.icon className="h-[13px] w-[13px]" />,
              }))}
              onChange={(v) => {
                set("colorScheme", v);
                setPreviewDark(v === "dark");
              }}
            />
            {draft.colorScheme !== "light" ? (
              <div className="mt-[12px] grid animate-kv-fade gap-[12px] sm:grid-cols-3">
                <ColorField label="Latar gelap" value={draft.darkBackgroundColor} onChange={(v) => set("darkBackgroundColor", v)} />
                <ColorField label="Permukaan gelap" hint="Kartu & kotak" value={draft.darkSurfaceColor} onChange={(v) => set("darkSurfaceColor", v)} />
                <ColorField label="Teks gelap" value={draft.darkTextColor} onChange={(v) => set("darkTextColor", v)} />
              </div>
            ) : null}
          </Group>
        </div>

        <div className="min-w-0 xl:sticky xl:top-[16px] xl:self-start">
          <div className="kv-frame p-[4px]">
            <div className="flex items-center justify-between gap-[8px] px-[8px] py-[6px]">
              <p className="text-[13px] font-medium text-kv-secondary-fg">Pratinjau langsung</p>
              {draft.colorScheme === "auto" ? (
                <div role="radiogroup" aria-label="Pratinjau mode" className="flex rounded-[7px] border-[0.8px] border-kv-border bg-kv-card p-[2px]">
                  {[
                    { dark: false, icon: Sun, label: "Terang" },
                    { dark: true, icon: Moon, label: "Gelap" },
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      role="radio"
                      aria-checked={previewDark === option.dark}
                      aria-label={`Pratinjau ${option.label.toLowerCase()}`}
                      onClick={() => setPreviewDark(option.dark)}
                      className={cn(
                        "flex h-[20px] w-[24px] items-center justify-center rounded-[5px]",
                        previewDark === option.dark ? "kv-gradient text-white" : "text-kv-muted-fg"
                      )}
                    >
                      <option.icon className="h-[12px] w-[12px]" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <ThemePreview tokens={draft} dark={showDark} />
          </div>

          {canEdit ? (
            <div className="mt-[10px] flex items-center justify-between gap-[10px] rounded-[10px] border-[0.8px] border-kv-border bg-kv-card px-[12px] py-[8px]">
              <p className="min-w-0 truncate text-[12px] text-kv-muted-fg">
                {dirty ? (
                  <span className="inline-flex items-center gap-[6px] text-kv-fg">
                    <span className="h-[6px] w-[6px] rounded-full bg-amber-500" /> Ada perubahan belum disimpan
                  </span>
                ) : websiteCount > 1 ? (
                  `Berlaku untuk ${websiteCount} situs`
                ) : (
                  "Berlaku untuk semua halaman publik"
                )}
              </p>
              <div className="flex shrink-0 gap-[6px]">
                {dirty ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(tokens)} disabled={pending}>
                    <RotateCcw /> Reset
                  </Button>
                ) : null}
                <Button type="submit" size="sm" disabled={pending || !dirty}>
                  {pending ? <Loader2 className="animate-spin" /> : null}
                  Simpan tema
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </fieldset>
    </form>
  );
}

/* ------------------------------------------------------------------ */

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 border-t-[0.8px] border-kv-border pt-[16px] first:border-t-0 first:pt-0">
      <h3 className="text-[13px] font-semibold text-kv-fg">{title}</h3>
      {hint ? <p className="mt-[2px] text-[12px] text-kv-muted-fg">{hint}</p> : null}
      <div className="mt-[12px]">{children}</div>
    </section>
  );
}

function ColorField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const valid = HEX.test(value);
  return (
    <label className="block min-w-0">
      <span className="flex items-baseline justify-between gap-[6px]">
        <span className="text-[12px] font-medium text-kv-fg">{label}</span>
        {hint ? <span className="truncate text-[11px] text-kv-subtle">{hint}</span> : null}
      </span>
      <span
        className={cn(
          "mt-[6px] flex h-[34px] items-center gap-[6px] rounded-[8px] border-[0.8px] bg-kv-card pl-[4px] pr-[8px] transition-colors focus-within:border-[#9ca3af]",
          valid ? "border-kv-border" : "border-red-300"
        )}
      >
        <span className="relative h-[26px] w-[26px] shrink-0 overflow-hidden rounded-[6px] border-[0.8px] border-black/10" style={{ backgroundColor: valid ? value : "transparent" }}>
          <input
            type="color"
            value={valid ? value : "#000000"}
            onChange={(event) => onChange(event.target.value)}
            aria-label={`${label} — pemilih warna`}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value.trim())}
          spellCheck={false}
          maxLength={7}
          aria-label={`${label} — kode hex`}
          className="min-w-0 flex-1 bg-transparent font-mono text-[12px] uppercase text-kv-fg outline-none"
        />
      </span>
    </label>
  );
}

function FontPicker({
  label,
  value,
  onChange,
  heading,
}: {
  label: string;
  value: Tokens["bodyFont"];
  onChange: (value: Tokens["bodyFont"]) => void;
  heading?: boolean;
}) {
  return (
    <div className="mb-[12px] last:mb-0">
      <p className="mb-[6px] text-[12px] font-medium text-kv-fg">{label}</p>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-[6px] sm:grid-cols-5">
        {FONT_CHOICES.map((font) => {
          const on = value === font;
          return (
            <button
              key={font}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(font)}
              className={cn(
                "flex flex-col items-start gap-[2px] rounded-[8px] border-[0.8px] bg-kv-card px-[10px] py-[8px] text-left transition-colors",
                on ? "border-kv-fg shadow-[inset_0_0_0_0.4px_#1f2937]" : "border-kv-border hover:bg-kv-hover"
              )}
            >
              <span className={cn("leading-none text-kv-fg", heading ? "text-[20px] font-semibold" : "text-[18px]")} style={{ fontFamily: FONT_STACKS[font] }}>
                Aa
              </span>
              <span className="text-[11px] text-kv-muted-fg">{FONT_LABEL[font]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  hideLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  hideLabel?: boolean;
  value: T;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="min-w-0">
      {hideLabel ? null : <p className="mb-[6px] text-[12px] font-medium text-kv-fg">{label}</p>}
      <div role="radiogroup" aria-label={label} className="flex rounded-[8px] border-[0.8px] border-kv-border bg-kv-secondary p-[2px]">
        {options.map((option) => {
          const on = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex h-[28px] min-w-0 flex-1 items-center justify-center gap-[5px] rounded-[6px] px-[6px] text-[12px] font-medium transition-colors",
                on ? "bg-kv-card text-kv-fg shadow-kv-active" : "text-kv-muted-fg hover:text-kv-fg"
              )}
            >
              {option.icon}
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A small page drawn with the draft tokens: header, hero, two cards. Spacing
 * and width are scaled down so their differences still read at this size.
 */
function ThemePreview({ tokens, dark }: { tokens: Tokens; dark: boolean }) {
  const bg = dark ? tokens.darkBackgroundColor : tokens.backgroundColor;
  const fg = dark ? tokens.darkTextColor : tokens.textColor;
  const surface = dark ? tokens.darkSurfaceColor : "rgba(0,0,0,0.035)";
  const radius = RADIUS_PX[tokens.radius];
  const gap = { compact: 14, normal: 22, roomy: 32 }[tokens.spacing];
  const width = { narrow: "78%", normal: "90%", wide: "100%" }[tokens.containerWidth];

  return (
    <div
      aria-hidden
      className="overflow-hidden rounded-[10px] border-[0.8px] border-kv-input"
      data-bd-scheme={dark ? "dark" : undefined}
      style={
        {
          ...builderDesignTokenStyle(tokens),
          ...darkModeVariables(tokens),
          backgroundColor: bg,
          color: fg,
        } as React.CSSProperties
      }
    >
      <div className="flex items-center justify-between px-[14px] py-[10px]" style={{ borderBottom: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}` }}>
        <span className="text-[13px] font-semibold" style={{ fontFamily: FONT_STACKS[tokens.headingFont] }}>
          Toko Kamu
        </span>
        <span className="flex items-center gap-[10px] text-[10px] opacity-70">
          <span>Produk</span>
          <span>Blog</span>
          <span className="px-[8px] py-[3px] text-white opacity-100" style={{ backgroundColor: tokens.accentColor, borderRadius: radius }}>
            Masuk
          </span>
        </span>
      </div>

      <div className="mx-auto px-[14px] transition-all duration-300" style={{ width, paddingTop: gap, paddingBottom: gap }}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: tokens.accentColor }}>
          Koleksi baru
        </p>
        <p className="mt-[6px] text-[20px] font-semibold leading-tight" style={{ fontFamily: FONT_STACKS[tokens.headingFont] }}>
          Tas kanvas untuk setiap hari
        </p>
        <p className="mt-[6px] text-[11px] leading-[1.55] opacity-75" style={{ fontFamily: FONT_STACKS[tokens.bodyFont] }}>
          Kuat, ringan, dan dijahit rapi. Paragraf ini memakai font isi dan warna teks tema.
        </p>
        <div className="mt-[12px] flex gap-[6px]">
          <span className="px-[12px] py-[6px] text-[11px] font-medium text-white" style={{ backgroundColor: tokens.accentColor, borderRadius: radius }}>
            Beli sekarang
          </span>
          <span className="px-[12px] py-[6px] text-[11px] font-medium" style={{ border: `1px solid ${dark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)"}`, borderRadius: radius }}>
            Lihat detail
          </span>
        </div>

        <div className="grid grid-cols-2 gap-[8px]" style={{ marginTop: gap }}>
          {["Tote Bag", "Pouch"].map((name, i) => (
            <div key={name} className="overflow-hidden" style={{ backgroundColor: surface, borderRadius: radius }}>
              <div className="h-[46px]" style={{ backgroundColor: tokens.accentColor, opacity: i === 0 ? 0.18 : 0.1 }} />
              <div className="p-[8px]">
                <p className="text-[11px] font-semibold" style={{ fontFamily: FONT_STACKS[tokens.headingFont] }}>
                  {name}
                </p>
                <p className="text-[10px] opacity-70">Rp {i === 0 ? "120.000" : "65.000"}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
