"use client";

import { AlignCenter, AlignLeft, AlignRight, Minus } from "lucide-react";

import type { BlockStyle } from "@/lib/blocks/schema";
import {
  BODY_SIZE_PRESETS,
  EMPTY_BLOCK_STYLE,
  HEADING_SIZE_PRESETS,
  RADIUS_PRESETS,
  borderWidth,
  resolveSpacing,
  resolveDeviceStyle,
  resolveStyleValue,
  sanitizeAnchorId,
  slugifyAnchorId,
  type StyleDevice,
} from "@/lib/blocks/style";
import { ChoiceField, ColorField, TextField, ToggleField } from "./fields";
import { ImageUrlUpload } from "./image-url-upload";
import { NumberSliderField } from "./settings/shared";
import {
  BoxSpacingField,
  ChangedDot,
  QuickPicks,
  SegmentedField,
  StyleSection,
  type SideKey,
} from "./style-controls";

/**
 * The sections of the Style tab. Each receives the whole style plus two
 * writers: `setStyle` lands on the active device level (desktop, or the
 * tablet/mobile override) and is what every look-related field uses;
 * `setGlobal` always lands on the base style and is kept for the few fields
 * that are the same on every device (sticky, anchor id, CSS classes).
 */
export type StyleSectionProps = {
  style: BlockStyle;
  device: StyleDevice;
  /** Just the fields the active device level sets itself. */
  level: Partial<BlockStyle>;
  setStyle: (patch: Partial<BlockStyle>) => void;
  setGlobal: (patch: Partial<BlockStyle>) => void;
};

function num(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isSet(...values: unknown[]) {
  return values.some((value) => value !== undefined && value !== "" && value !== null);
}

/**
 * Whether a section differs from what this device would otherwise get: on
 * desktop, from the defaults; on tablet/mobile, whether this device level
 * overrides any of the section's fields.
 */
function sectionChanged(
  style: BlockStyle,
  level: Partial<BlockStyle>,
  device: StyleDevice,
  keys: (keyof BlockStyle)[]
) {
  if (device !== "desktop") return keys.some((key) => isSet(level[key]));
  return keys.some(
    (key) =>
      isSet(style[key]) &&
      JSON.stringify(style[key]) !== JSON.stringify(EMPTY_BLOCK_STYLE[key])
  );
}

function changedLabel(device: StyleDevice) {
  return device === "desktop" ? "Sudah diubah" : `Diatur khusus ${device}`;
}

/* ----- Spacing ----- */

export function SpacingSection({ style, device, level, setStyle }: StyleSectionProps) {
  const spacing = resolveSpacing(style, device);
  const paddingSides: Record<SideKey, keyof BlockStyle> = {
    top: "paddingTopValue",
    right: "paddingRightValue",
    bottom: "paddingBottomValue",
    left: "paddingLeftValue",
  };
  const paddingSplit =
    isSet(level.paddingTopValue, level.paddingBottomValue, level.paddingLeftValue, level.paddingRightValue) ||
    spacing.paddingTop !== spacing.paddingBottom ||
    spacing.paddingLeft !== spacing.paddingRight;
  const marginSplit =
    isSet(level.marginTopValue, level.marginBottomValue) ||
    spacing.marginTop !== spacing.marginBottom ||
    spacing.marginTop < 0;
  const changed = sectionChanged(style, level, device, ["paddingY", "paddingX", "marginY", "paddingYValue", "paddingXValue", "marginYValue", "paddingTopValue", "paddingBottomValue", "paddingLeftValue", "paddingRightValue", "marginTopValue", "marginBottomValue"]);

  return (
    <StyleSection
      title="Spacing"
      description="Padding dan margin, bisa per sisi"
      defaultOpen
      badge={changed ? <ChangedDot label={changedLabel(device)} /> : null}
    >
      <BoxSpacingField
        key={`padding-${device}`}
        label="Padding"
        sides={["top", "right", "bottom", "left"]}
        values={{
          top: spacing.paddingTop,
          right: spacing.paddingRight,
          bottom: spacing.paddingBottom,
          left: spacing.paddingLeft,
        }}
        min={0}
        max={240}
        initiallyLinked={!paddingSplit}
        onSideChange={(side, value) => setStyle({ [paddingSides[side]]: value })}
        onLinkChange={(linked) => {
          if (!linked) return;
          setStyle({
            paddingYValue: spacing.paddingTop,
            paddingXValue: spacing.paddingLeft,
            paddingTopValue: undefined,
            paddingBottomValue: undefined,
            paddingLeftValue: undefined,
            paddingRightValue: undefined,
          });
        }}
        renderLinked={
          <div className="grid gap-2">
            <NumberSliderField
              label="Atas & bawah"
              value={spacing.paddingTop}
              min={0}
              max={240}
              step={2}
              onChange={(v) =>
                setStyle({ paddingYValue: v, paddingTopValue: undefined, paddingBottomValue: undefined })
              }
            />
            <NumberSliderField
              label="Kiri & kanan"
              value={spacing.paddingLeft}
              min={0}
              max={200}
              step={2}
              onChange={(v) =>
                setStyle({ paddingXValue: v, paddingLeftValue: undefined, paddingRightValue: undefined })
              }
            />
          </div>
        }
      />
      <BoxSpacingField
        key={`margin-${device}`}
        label="Margin"
        sides={["top", "bottom"]}
        values={{ top: spacing.marginTop, bottom: spacing.marginBottom }}
        min={-240}
        max={240}
        initiallyLinked={!marginSplit}
        onSideChange={(side, value) =>
          setStyle(side === "top" ? { marginTopValue: value } : { marginBottomValue: value })
        }
        onLinkChange={(linked) => {
          if (!linked) return;
          setStyle({
            marginYValue: Math.max(0, spacing.marginTop),
            marginTopValue: undefined,
            marginBottomValue: undefined,
          });
        }}
        renderLinked={
          <NumberSliderField
            label="Atas & bawah"
            value={Math.max(0, spacing.marginTop)}
            min={0}
            max={160}
            step={2}
            onChange={(v) =>
              setStyle({ marginYValue: v, marginTopValue: undefined, marginBottomValue: undefined })
            }
          />
        }
      />
      <p className="text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
        Margin negatif (mode per sisi) membuat block menumpuk ke block di
        atas/bawahnya.
      </p>
    </StyleSection>
  );
}

/* ----- Layout ----- */

const WIDTH_PICKS = [
  { value: 0, label: "Auto" },
  { value: 640, label: "640" },
  { value: 768, label: "768" },
  { value: 960, label: "960" },
  { value: 1152, label: "1152" },
  { value: 1280, label: "1280" },
];

export function LayoutSection({ style, device, level, setStyle }: StyleSectionProps) {
  const r = resolveDeviceStyle(style, device);
  const maxWidth = num(r.maxWidthValue);
  const minHeight = num(resolveStyleValue(style, device, "minHeightValue"));
  const unit = resolveStyleValue(style, device, "minHeightUnit") ?? "px";
  const changed = sectionChanged(style, level, device, ["maxWidthValue", "minHeightValue", "minHeightUnit", "verticalAlign"]);

  return (
    <StyleSection
      title="Layout"
      description="Lebar konten, tinggi minimum, posisi isi"
      badge={changed ? <ChangedDot label={changedLabel(device)} /> : null}
    >
      <div className="space-y-2">
        <NumberSliderField
          label="Lebar maksimum"
          value={maxWidth}
          min={0}
          max={1600}
          step={8}
          zeroLabel="Auto"
          onChange={(v) => setStyle({ maxWidthValue: v || undefined })}
        />
        <QuickPicks
          value={maxWidth}
          options={WIDTH_PICKS}
          onPick={(v) => setStyle({ maxWidthValue: v || undefined })}
        />
      </div>
      <div className="space-y-2">
        <NumberSliderField
          label="Tinggi minimum"
          value={minHeight}
          min={0}
          max={unit === "vh" ? 100 : 1200}
          step={unit === "vh" ? 5 : 10}
          unit={unit}
          zeroLabel="Auto"
          onChange={(v) => setStyle({ minHeightValue: v, minHeightUnit: unit })}
        />
        <SegmentedField
          label="Satuan"
          value={unit}
          options={[
            { value: "px", label: "Pixel" },
            { value: "vh", label: "% layar" },
          ]}
          onChange={(next) => {
            if (next === unit) return;
            // Pixel and screen-height values do not convert; start each unit
            // from a sensible "tall section" value instead.
            const converted = minHeight === 0 ? 0 : next === "vh" ? 100 : 600;
            setStyle({ minHeightUnit: next, minHeightValue: converted });
          }}
        />
      </div>
      {minHeight > 0 ? (
        <SegmentedField
          label="Posisi isi (vertikal)"
          value={r.verticalAlign ?? "top"}
          options={[
            { value: "top", label: "Atas" },
            { value: "center", label: "Tengah" },
            { value: "bottom", label: "Bawah" },
          ]}
          onChange={(v) => setStyle({ verticalAlign: v })}
        />
      ) : null}
    </StyleSection>
  );
}

/* ----- Background ----- */

export function BackgroundSection({ style, device, level, setStyle }: StyleSectionProps) {
  const r = resolveDeviceStyle(style, device);
  const type = r.backgroundType ?? "color";
  const bgColor = resolveStyleValue(style, device, "backgroundColor") ?? "";
  const changed = sectionChanged(style, level, device, ["backgroundColor", "backgroundType", "gradientFrom", "gradientTo", "gradientAngle", "gradientShape", "backgroundImage", "backgroundSize", "backgroundPosition", "backgroundRepeat", "backgroundFixed", "overlayColor", "overlayOpacity"]);

  return (
    <StyleSection
      title="Background"
      description="Warna, gradien, atau gambar dengan overlay"
      badge={changed ? <ChangedDot label={changedLabel(device)} /> : null}
    >
      <SegmentedField
        label="Jenis"
        value={type}
        options={[
          { value: "color", label: "Warna" },
          { value: "gradient", label: "Gradien" },
          { value: "image", label: "Gambar" },
        ]}
        onChange={(v) =>
          setStyle(
            v === "gradient" && !r.gradientFrom && !r.gradientTo
              ? { backgroundType: v, gradientFrom: "#eef2ff", gradientTo: "#fdf2f8" }
              : { backgroundType: v }
          )
        }
      />
      <ColorField
        label={type === "color" ? "Warna background" : "Warna dasar"}
        value={bgColor}
        onChange={(v) => setStyle({ backgroundColor: v })}
        placeholder="transparent"
      />

      {type === "gradient" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <ColorField
              label="Dari"
              value={r.gradientFrom ?? ""}
              onChange={(v) => setStyle({ gradientFrom: v })}
              placeholder="#eef2ff"
            />
            <ColorField
              label="Ke"
              value={r.gradientTo ?? ""}
              onChange={(v) => setStyle({ gradientTo: v })}
              placeholder="#fdf2f8"
            />
          </div>
          <SegmentedField
            label="Bentuk"
            value={r.gradientShape ?? "linear"}
            options={[
              { value: "linear", label: "Linear" },
              { value: "radial", label: "Radial" },
            ]}
            onChange={(v) => setStyle({ gradientShape: v })}
          />
          {r.gradientShape !== "radial" ? (
            <NumberSliderField
              label="Sudut"
              value={num(r.gradientAngle, 135)}
              min={0}
              max={360}
              step={5}
              unit="°"
              onChange={(v) => setStyle({ gradientAngle: v })}
            />
          ) : null}
        </>
      ) : null}

      {type === "image" ? (
        <>
          <ImageUrlUpload
            label="Gambar background"
            value={r.backgroundImage ?? ""}
            onChange={(v) => setStyle({ backgroundImage: v })}
            placeholder="Upload gambar atau paste URL"
          />
          <div className="grid grid-cols-2 gap-2">
            <ChoiceField
              label="Ukuran"
              value={r.backgroundSize ?? "cover"}
              onChange={(v) => setStyle({ backgroundSize: v })}
              options={[
                { value: "cover", label: "Penuh (cover)" },
                { value: "contain", label: "Muat (contain)" },
                { value: "auto", label: "Asli" },
              ]}
            />
            <ChoiceField
              label="Posisi"
              value={r.backgroundPosition ?? "center"}
              onChange={(v) => setStyle({ backgroundPosition: v })}
              options={[
                { value: "center", label: "Tengah" },
                { value: "top", label: "Atas" },
                { value: "bottom", label: "Bawah" },
                { value: "left", label: "Kiri" },
                { value: "right", label: "Kanan" },
              ]}
            />
          </div>
          <ToggleField
            label="Ulangi gambar (pattern)"
            checked={Boolean(r.backgroundRepeat)}
            onChange={(v) => setStyle({ backgroundRepeat: v })}
          />
          <ToggleField
            label="Efek parallax (fixed)"
            checked={Boolean(r.backgroundFixed)}
            onChange={(v) => setStyle({ backgroundFixed: v })}
            hint="Gambar diam saat halaman di-scroll. Otomatis mati di HP/tablet."
          />
        </>
      ) : null}

      {type !== "color" ? (
        <div className="space-y-2">
          <ColorField
            label="Overlay"
            value={r.overlayColor ?? ""}
            onChange={(v) => setStyle({ overlayColor: v })}
            placeholder="#000000"
          />
          <NumberSliderField
            label="Kepekatan overlay"
            value={num(r.overlayOpacity)}
            min={0}
            max={100}
            step={5}
            unit="%"
            onChange={(v) => setStyle({ overlayOpacity: v })}
          />
        </div>
      ) : null}
    </StyleSection>
  );
}

/* ----- Typography ----- */

export function TypographySection({ style, device, level, setStyle }: StyleSectionProps) {
  const r = resolveDeviceStyle(style, device);
  const headingSize = num(
    resolveStyleValue(style, device, "headingSizeValue"),
    HEADING_SIZE_PRESETS[resolveStyleValue(style, device, "headingSize") ?? "default"] ?? 0
  );
  const bodySize = num(
    resolveStyleValue(style, device, "bodySizeValue"),
    BODY_SIZE_PRESETS[resolveStyleValue(style, device, "bodySize") ?? "default"] ?? 0
  );
  const textAlign = resolveStyleValue(style, device, "textAlign") ?? "default";
  const changed = sectionChanged(style, level, device, ["fontFamily", "textColor", "headingColor", "accentColor", "headingSize", "headingSizeValue", "bodySize", "bodySizeValue", "textAlign", "headingWeight", "headingTransform", "letterSpacingValue", "lineHeightValue"]);

  return (
    <StyleSection
      title="Tipografi"
      description="Font, warna, ukuran, dan perataan teks"
      badge={changed ? <ChangedDot label={changedLabel(device)} /> : null}
    >
      <ChoiceField
        label="Font"
        value={r.fontFamily ?? "default"}
        onChange={(v) => setStyle({ fontFamily: v })}
        options={[
          { value: "default", label: "Default tema" },
          { value: "sans", label: "Sans" },
          { value: "serif", label: "Serif" },
          { value: "mono", label: "Mono" },
          { value: "display", label: "Font heading tema" },
        ]}
      />
      <div className="grid grid-cols-2 gap-2">
        <ColorField
          label="Warna teks"
          value={resolveStyleValue(style, device, "textColor") ?? ""}
          onChange={(v) => setStyle({ textColor: v })}
          placeholder="#18181b"
        />
        <ColorField
          label="Warna judul"
          value={r.headingColor ?? ""}
          onChange={(v) => setStyle({ headingColor: v })}
          placeholder="ikut teks"
        />
      </div>
      <ColorField
        label="Warna aksen (tombol, ikon, highlight)"
        value={r.accentColor ?? ""}
        onChange={(v) => setStyle({ accentColor: v })}
        placeholder="ikut tema"
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberSliderField
          label="Ukuran judul"
          value={headingSize}
          min={0}
          max={120}
          step={1}
          zeroLabel="Auto"
          onChange={(v) => setStyle({ headingSizeValue: v })}
        />
        <NumberSliderField
          label="Ukuran teks"
          value={bodySize}
          min={0}
          max={64}
          step={1}
          zeroLabel="Auto"
          onChange={(v) => setStyle({ bodySizeValue: v })}
        />
      </div>
      <SegmentedField
        label="Perataan teks"
        value={textAlign}
        options={[
          { value: "default", label: <Minus className="h-3.5 w-3.5" />, title: "Default" },
          { value: "left", label: <AlignLeft className="h-3.5 w-3.5" />, title: "Kiri" },
          { value: "center", label: <AlignCenter className="h-3.5 w-3.5" />, title: "Tengah" },
          { value: "right", label: <AlignRight className="h-3.5 w-3.5" />, title: "Kanan" },
        ]}
        onChange={(v) => setStyle({ textAlign: v })}
      />
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Tebal judul"
          value={r.headingWeight ?? "default"}
          onChange={(v) => setStyle({ headingWeight: v })}
          options={[
            { value: "default", label: "Default" },
            { value: "400", label: "Regular" },
            { value: "500", label: "Medium" },
            { value: "600", label: "Semibold" },
            { value: "700", label: "Bold" },
            { value: "800", label: "Extra bold" },
            { value: "900", label: "Black" },
          ]}
        />
        <ChoiceField
          label="Huruf judul"
          value={r.headingTransform ?? "none"}
          onChange={(v) => setStyle({ headingTransform: v })}
          options={[
            { value: "none", label: "Normal" },
            { value: "uppercase", label: "KAPITAL" },
            { value: "capitalize", label: "Awal Kapital" },
            { value: "lowercase", label: "kecil" },
          ]}
        />
      </div>
      <NumberSliderField
        label="Jarak huruf judul"
        value={num(r.letterSpacingValue)}
        min={-0.1}
        max={0.5}
        step={0.01}
        decimals={2}
        unit="em"
        zeroLabel="Normal"
        onChange={(v) => setStyle({ letterSpacingValue: v || undefined })}
      />
      <NumberSliderField
        label="Tinggi baris teks"
        value={num(r.lineHeightValue)}
        min={0}
        max={3}
        step={0.05}
        decimals={2}
        unit=""
        zeroLabel="Auto"
        onChange={(v) => setStyle({ lineHeightValue: v || undefined })}
      />
    </StyleSection>
  );
}

/* ----- Border & shadow ----- */

export function BorderSection({ style, device, level, setStyle }: StyleSectionProps) {
  const r = resolveDeviceStyle(style, device);
  const radius = num(
    resolveStyleValue(style, device, "borderRadiusValue"),
    RADIUS_PRESETS[resolveStyleValue(style, device, "borderRadius") ?? "none"] ?? 0
  );
  const width = borderWidth(style);
  const changed = sectionChanged(style, level, device, ["borderRadius", "borderRadiusValue", "border", "borderWidthValue", "borderStyle", "borderSides", "borderColor", "shadow"]);

  return (
    <StyleSection
      title="Border & bayangan"
      description="Sudut, garis tepi, dan shadow"
      badge={changed ? <ChangedDot label={changedLabel(device)} /> : null}
    >
      <NumberSliderField
        label="Sudut membulat"
        value={radius}
        min={0}
        max={80}
        step={1}
        onChange={(v) => setStyle({ borderRadiusValue: v })}
      />
      <NumberSliderField
        label="Tebal garis"
        value={width}
        min={0}
        max={24}
        step={1}
        zeroLabel="Tidak ada"
        onChange={(v) => setStyle({ borderWidthValue: v })}
      />
      {width > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <ChoiceField
              label="Gaya garis"
              value={r.borderStyle ?? "solid"}
              onChange={(v) => setStyle({ borderStyle: v })}
              options={[
                { value: "solid", label: "Solid" },
                { value: "dashed", label: "Putus-putus" },
                { value: "dotted", label: "Titik-titik" },
                { value: "double", label: "Ganda" },
              ]}
            />
            <ChoiceField
              label="Sisi"
              value={r.borderSides ?? "all"}
              onChange={(v) => setStyle({ borderSides: v })}
              options={[
                { value: "all", label: "Semua sisi" },
                { value: "y", label: "Atas & bawah" },
                { value: "x", label: "Kiri & kanan" },
                { value: "top", label: "Atas saja" },
                { value: "bottom", label: "Bawah saja" },
              ]}
            />
          </div>
          <ColorField
            label="Warna garis"
            value={r.borderColor ?? ""}
            onChange={(v) => setStyle({ borderColor: v })}
            placeholder="#e4e4e7"
          />
        </>
      ) : null}
      <ChoiceField
        label="Bayangan"
        value={r.shadow ?? "none"}
        onChange={(v) => setStyle({ shadow: v })}
        options={[
          { value: "none", label: "Tidak ada" },
          { value: "sm", label: "Kecil" },
          { value: "md", label: "Sedang" },
          { value: "lg", label: "Besar" },
          { value: "xl", label: "Sangat besar" },
          { value: "2xl", label: "Dramatis" },
          { value: "inner", label: "Ke dalam" },
          { value: "glow", label: "Glow warna aksen" },
        ]}
      />
    </StyleSection>
  );
}

/* ----- Effects ----- */

export function EffectsSection({ style, device, level, setStyle, setGlobal }: StyleSectionProps) {
  const r = resolveDeviceStyle(style, device);
  const changed = sectionChanged(style, level, device, ["opacity", "backdropBlur", "clipContent"]) ||
    (device === "desktop" && Boolean(style.sticky));

  return (
    <StyleSection
      title="Efek"
      description="Transparansi, blur kaca, sticky"
      badge={changed ? <ChangedDot label={changedLabel(device)} /> : null}
    >
      <NumberSliderField
        label="Opacity"
        value={num(r.opacity, 100)}
        min={0}
        max={100}
        step={5}
        unit="%"
        onChange={(v) => setStyle({ opacity: v })}
      />
      <NumberSliderField
        label="Blur latar (efek kaca)"
        value={num(r.backdropBlur)}
        min={0}
        max={40}
        step={1}
        zeroLabel="Mati"
        onChange={(v) => setStyle({ backdropBlur: v })}
      />
      <ToggleField
        label="Menempel di atas saat scroll (sticky)"
        checked={Boolean(style.sticky)}
        onChange={(v) => setGlobal({ sticky: v })}
        hint="Berlaku di semua device. Cocok untuk header atau banner promo; tidak aktif di kanvas builder."
      />
      <ToggleField
        label="Potong isi yang keluar batas"
        checked={Boolean(r.clipContent)}
        onChange={(v) => setStyle({ clipContent: v })}
      />
    </StyleSection>
  );
}

/* ----- Advanced ----- */

export function AdvancedSection({ style, setGlobal }: StyleSectionProps) {
  const anchor = style.anchorId ?? "";
  const anchorValid = !anchor || Boolean(sanitizeAnchorId(anchor));
  const changed = isSet(style.anchorId, style.className);

  return (
    <StyleSection
      title="Lanjutan"
      description="Anchor ID untuk link #, class CSS kustom (semua device)"
      badge={changed ? <ChangedDot /> : null}
    >
      <TextField
        label="Anchor ID"
        value={anchor}
        onChange={(v) => setGlobal({ anchorId: slugifyAnchorId(v) })}
        placeholder="contoh: harga"
        hint={
          anchor && anchorValid
            ? `Tautkan tombol/menu ke #${anchor} untuk scroll ke block ini.`
            : "Dipakai untuk link #section dari tombol atau menu."
        }
      />
      <TextField
        label="Class CSS"
        value={style.className ?? ""}
        onChange={(v) => setGlobal({ className: v.replace(/[^\w\s-]/g, "") })}
        placeholder="promo highlight"
        hint="Pisahkan dengan spasi. Atur tampilannya lewat Custom CSS halaman."
      />
    </StyleSection>
  );
}
