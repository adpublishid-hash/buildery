"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { MousePointer2, Play, RotateCcw } from "lucide-react";

import type { BuilderFormOption, PreviewDevice } from "./page-builder";
import type { Block, BlockStyle } from "@/lib/blocks/schema";
import {
  ANIMATION_PRESET_OPTIONS,
  DEFAULT_BLOCK_ANIMATION,
  resolveBlockAnimation,
  type BlockAnimation,
} from "@/lib/blocks/animation";
import { BLOCK_REGISTRY } from "@/lib/blocks/registry";
import { cn } from "@/lib/utils";
import { ChoiceField, ColorField, ToggleField } from "./fields";
import { NumberSliderField } from "./settings/shared";

/**
 * Form pengaturan per tipe block dimuat saat dibutuhkan.
 *
 * Seluruhnya dulu berada dalam satu modul ~4.800 baris, jadi membuka builder
 * mengunduh form untuk 30+ tipe block sekaligus — padahal satu halaman jarang
 * memakai lebih dari segelintir. Placeholder-nya sengaja setinggi satu baris
 * supaya panel tidak melompat saat potongannya tiba.
 */
const loading = () => (
  <p className="px-1 py-2 text-xs text-zinc-400">Memuat pengaturan…</p>
);

const AffiliateCtaForm = dynamic(() => import("./settings/affiliate-cta-form").then((m) => m.AffiliateCtaForm), { loading });
const BannerForm = dynamic(() => import("./settings/banner-form").then((m) => m.BannerForm), { loading });
const BioProfileForm = dynamic(() => import("./settings/bio-profile-form").then((m) => m.BioProfileForm), { loading });
const ButtonForm = dynamic(() => import("./settings/button-form").then((m) => m.ButtonForm), { loading });
const CollectionForm = dynamic(() => import("./settings/collection-form").then((m) => m.CollectionForm), { loading });
const ColumnsForm = dynamic(() => import("./settings/columns-form").then((m) => m.ColumnsForm), { loading });
const ComparisonTableForm = dynamic(() => import("./settings/comparison-table-form").then((m) => m.ComparisonTableForm), { loading });
const ContactFormForm = dynamic(() => import("./settings/contact-form-form").then((m) => m.ContactFormForm), { loading });
const CountdownForm = dynamic(() => import("./settings/countdown-form").then((m) => m.CountdownForm), { loading });
const CtaForm = dynamic(() => import("./settings/cta-form").then((m) => m.CtaForm), { loading });
const CustomHtmlSettings = dynamic(() => import("./settings/custom-html-settings").then((m) => m.CustomHtmlSettings), { loading });
const DividerForm = dynamic(() => import("./settings/divider-form").then((m) => m.DividerForm), { loading });
const FaqForm = dynamic(() => import("./settings/faq-form").then((m) => m.FaqForm), { loading });
const FeatureGridForm = dynamic(() => import("./settings/feature-grid-form").then((m) => m.FeatureGridForm), { loading });
const FooterForm = dynamic(() => import("./settings/footer-form").then((m) => m.FooterForm), { loading });
const FormEmbedForm = dynamic(() => import("./settings/form-embed-form").then((m) => m.FormEmbedForm), { loading });
const GalleryForm = dynamic(() => import("./settings/gallery-form").then((m) => m.GalleryForm), { loading });
const HeaderForm = dynamic(() => import("./settings/header-form").then((m) => m.HeaderForm), { loading });
const HeroForm = dynamic(() => import("./settings/hero-form").then((m) => m.HeroForm), { loading });
const ImageForm = dynamic(() => import("./settings/image-form").then((m) => m.ImageForm), { loading });
const ImageSliderForm = dynamic(() => import("./settings/image-slider-form").then((m) => m.ImageSliderForm), { loading });
const LogosForm = dynamic(() => import("./settings/logos-form").then((m) => m.LogosForm), { loading });
const MarqueeForm = dynamic(() => import("./settings/marquee-form").then((m) => m.MarqueeForm), { loading });
const MenuForm = dynamic(() => import("./settings/menu-form").then((m) => m.MenuForm), { loading });
const NewsletterForm = dynamic(() => import("./settings/newsletter-form").then((m) => m.NewsletterForm), { loading });
const PricingForm = dynamic(() => import("./settings/pricing-form").then((m) => m.PricingForm), { loading });
const StatsForm = dynamic(() => import("./settings/stats-form").then((m) => m.StatsForm), { loading });
const StepsForm = dynamic(() => import("./settings/steps-form").then((m) => m.StepsForm), { loading });
const TestimonialForm = dynamic(() => import("./settings/testimonial-form").then((m) => m.TestimonialForm), { loading });
const TextForm = dynamic(() => import("./settings/text-form").then((m) => m.TextForm), { loading });
const VideoForm = dynamic(() => import("./settings/video-form").then((m) => m.VideoForm), { loading });
const WhatsappFloatForm = dynamic(() => import("./settings/whatsapp-float-form").then((m) => m.WhatsappFloatForm), { loading });
const MapForm = dynamic(() => import("./settings/map-form").then((m) => m.MapForm), { loading });
const TabsForm = dynamic(() => import("./settings/tabs-form").then((m) => m.TabsForm), { loading });

type Props = {
  block: Block | null;
  previewDevice: PreviewDevice;
  onPreviewDeviceChange: (device: PreviewDevice) => void;
  onChange: (data: Block["data"]) => void;
  formOptions?: BuilderFormOption[];
  /** Replays block entrances in the canvas so edits can be previewed. */
  onReplayAnimation?: () => void;
};

export function SettingsPanel({
  block,
  previewDevice,
  onPreviewDeviceChange,
  onChange,
  formOptions = [],
  onReplayAnimation,
}: Props) {
  const [activeTab, setActiveTab] = useState<"content" | "style" | "animation">(
    "content"
  );

  useEffect(() => {
    setActiveTab("content");
  }, [block?.id]);

  if (!block) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
          <MousePointer2 className="h-5 w-5 text-zinc-400" />
        </div>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          No block selected
        </p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Click a block on the canvas to edit its content here.
        </p>
      </div>
    );
  }

  const meta = BLOCK_REGISTRY[block.type];
  const Icon = meta.icon;
  const dataWithStyle = block.data as Block["data"] & {
    style: BlockStyle;
    motion?: BlockAnimation;
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-200/70 px-4 py-3 dark:border-zinc-800">
        <Icon className="h-4 w-4 text-zinc-500" />
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {meta.label}
        </span>
      </div>
      <div className="border-b border-zinc-200/70 p-3 dark:border-zinc-800">
        <div className="grid grid-cols-3 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
          <TabButton
            active={activeTab === "content"}
            onClick={() => setActiveTab("content")}
          >
            Konten
          </TabButton>
          <TabButton
            active={activeTab === "style"}
            onClick={() => setActiveTab("style")}
          >
            Style
          </TabButton>
          <TabButton
            active={activeTab === "animation"}
            onClick={() => setActiveTab("animation")}
          >
            Animasi
          </TabButton>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "content" ? (
          <div className="space-y-4">
            {previewDevice !== "desktop" ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                Konten pada block yang sama berlaku untuk semua device. Untuk
                membuat versi berbeda, duplicate block lalu atur Show on di tab
                Style.
              </div>
            ) : null}
            <BlockForm
              block={block}
              onChange={onChange}
              formOptions={formOptions}
            />
          </div>
        ) : activeTab === "style" ? (
          <StyleForm
            data={dataWithStyle}
            activeDevice={previewDevice}
            onActiveDeviceChange={onPreviewDeviceChange}
            onChange={(next) => onChange(next as Block["data"])}
          />
        ) : (
          <AnimationForm
            data={dataWithStyle}
            onChange={(next) => onChange(next as Block["data"])}
            onReplay={onReplayAnimation}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-md text-sm font-medium transition",
        active
          ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
          : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      )}
    >
      {children}
    </button>
  );
}

function BlockForm({
  block,
  onChange,
  formOptions,
}: {
  block: Block;
  onChange: Props["onChange"];
  formOptions: BuilderFormOption[];
}) {
  switch (block.type) {
    case "HEADER":
      return <HeaderForm data={block.data} onChange={onChange} />;
    case "MENU":
      return <MenuForm data={block.data} onChange={onChange} />;
    case "HERO":
      return <HeroForm data={block.data} onChange={onChange} />;
    case "TEXT":
      return <TextForm data={block.data} onChange={onChange} />;
    case "CUSTOM_HTML":
      return <CustomHtmlSettings data={block.data} onChange={onChange} />;
    case "COLUMNS":
      return <ColumnsForm data={block.data} onChange={onChange} />;
    case "IMAGE":
      return <ImageForm data={block.data} onChange={onChange} />;
    case "CTA":
      return <CtaForm data={block.data} onChange={onChange} />;
    case "FEATURE_GRID":
      return <FeatureGridForm data={block.data} onChange={onChange} />;
    case "STATS":
      return <StatsForm data={block.data} onChange={onChange} />;
    case "STEPS":
      return <StepsForm data={block.data} onChange={onChange} />;
    case "PRICING":
      return <PricingForm data={block.data} onChange={onChange} />;
    case "TESTIMONIAL":
      return <TestimonialForm data={block.data} onChange={onChange} />;
    case "LOGOS":
      return <LogosForm data={block.data} onChange={onChange} />;
    case "GALLERY":
      return <GalleryForm data={block.data} onChange={onChange} />;
    case "IMAGE_SLIDER":
      return <ImageSliderForm data={block.data} onChange={onChange} />;
    case "VIDEO":
      return <VideoForm data={block.data} onChange={onChange} />;
    case "FAQ":
      return <FaqForm data={block.data} onChange={onChange} />;
    case "NEWSLETTER":
      return <NewsletterForm data={block.data} onChange={onChange} />;
    case "BANNER":
      return <BannerForm data={block.data} onChange={onChange} />;
    case "CONTACT_FORM":
      return <ContactFormForm data={block.data} onChange={onChange} />;
    case "FORM_EMBED":
      return (
        <FormEmbedForm
          data={block.data}
          onChange={onChange}
          formOptions={formOptions}
        />
      );
    case "DIVIDER":
      return <DividerForm data={block.data} onChange={onChange} />;
    case "PRODUCT_SHOWCASE":
    case "COURSE_SHOWCASE":
    case "BLOG_SHOWCASE":
    case "MEMBERSHIP_SHOWCASE":
      return <CollectionForm data={block.data} onChange={onChange} />;
    case "AFFILIATE_CTA":
      return <AffiliateCtaForm data={block.data} onChange={onChange} />;
    case "BUTTON":
      return <ButtonForm data={block.data} onChange={onChange} />;
    case "BIO_PROFILE":
      return <BioProfileForm data={block.data} onChange={onChange} />;
    case "COUNTDOWN":
      return <CountdownForm data={block.data} onChange={onChange} />;
    case "COMPARISON_TABLE":
      return <ComparisonTableForm data={block.data} onChange={onChange} />;
    case "MARQUEE":
      return <MarqueeForm data={block.data} onChange={onChange} />;
    case "FOOTER":
      return <FooterForm data={block.data} onChange={onChange} />;
    case "WHATSAPP_FLOAT":
      return <WhatsappFloatForm data={block.data} onChange={onChange} />;
    case "MAP":
      return <MapForm data={block.data} onChange={onChange} />;
    case "TABS":
      return <TabsForm data={block.data} onChange={onChange} />;
  }
}

/* ----- Form lintas block ----- */

function StyleForm({
  data,
  activeDevice,
  onActiveDeviceChange,
  onChange,
}: {
  data: Block["data"] & { style: BlockStyle };
  activeDevice: PreviewDevice;
  onActiveDeviceChange: (device: PreviewDevice) => void;
  onChange: (data: Block["data"] & { style: BlockStyle }) => void;
}) {
  // Older blocks saved before this block type had a `style` field may not
  // carry one in their stored JSON; default to an empty style so the editor
  // never crashes reading e.g. `style.visibility`.
  const style = (data.style ?? {}) as BlockStyle;
  const deviceStyle =
    activeDevice === "desktop"
      ? style
      : ({ ...style, ...(style[activeDevice] ?? {}) } as BlockStyle);
  const setStyle = (patch: Partial<BlockStyle>) => {
    if (activeDevice === "desktop") {
      onChange({ ...data, style: { ...style, ...patch } });
      return;
    }
    onChange({
      ...data,
      style: {
        ...style,
        [activeDevice]: { ...(style[activeDevice] ?? {}), ...patch },
      },
    });
  };

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Style
        </p>
        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          Atur spacing, warna, font, dan ukuran teks untuk block ini.
        </p>
      </div>

      <div className="grid grid-cols-3 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
        {(["desktop", "tablet", "mobile"] as const).map((device) => (
          <button
            key={device}
            type="button"
            onClick={() => onActiveDeviceChange(device)}
            className={cn(
              "h-8 rounded-md text-xs font-medium capitalize transition",
              activeDevice === device
                ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            )}
          >
            {device}
          </button>
        ))}
      </div>

      <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <ChoiceField
          label="Show on"
          value={style.visibility ?? "all"}
          onChange={(v) =>
            onChange({ ...data, style: { ...style, visibility: v } })
          }
          options={[
            { value: "all", label: "All devices" },
            { value: "desktop", label: "Desktop only" },
            { value: "tablet", label: "Tablet only" },
            { value: "mobile", label: "Mobile only" },
            { value: "desktop-tablet", label: "Desktop + tablet" },
            { value: "tablet-mobile", label: "Tablet + mobile" },
          ]}
        />
        <p className="text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">
          Pakai Duplicate block untuk membuat konten/layout khusus mobile atau
          desktop tanpa saling menimpa.
        </p>
      </div>

      <NumberSliderField
        label="Padding vertical"
        value={numericStyleValue(deviceStyle.paddingYValue, {
          default: 0,
          none: 0,
          sm: 24,
          lg: 72,
          xl: 112,
        }[deviceStyle.paddingY ?? "default"])}
        min={0}
        max={200}
        step={2}
        onChange={(v) => setStyle({ paddingYValue: v })}
      />
      <NumberSliderField
        label="Padding horizontal"
        value={numericStyleValue(deviceStyle.paddingXValue, {
          default: 0,
          none: 0,
          sm: 16,
          lg: 48,
        }[deviceStyle.paddingX ?? "default"])}
        min={0}
        max={160}
        step={2}
        onChange={(v) => setStyle({ paddingXValue: v })}
      />
      <NumberSliderField
        label="Margin vertical"
        value={numericStyleValue(deviceStyle.marginYValue, {
          none: 0,
          sm: 16,
          md: 32,
          lg: 56,
        }[deviceStyle.marginY ?? "none"])}
        min={0}
        max={160}
        step={2}
        onChange={(v) => setStyle({ marginYValue: v })}
      />
      <div className="grid grid-cols-2 gap-2">
        <ColorField
          label="Background"
          value={deviceStyle.backgroundColor}
          onChange={(v) => setStyle({ backgroundColor: v })}
          placeholder="#ffffff"
        />
        <ColorField
          label="Text color"
          value={deviceStyle.textColor}
          onChange={(v) => setStyle({ textColor: v })}
          placeholder="#18181b"
        />
      </div>
      <ChoiceField
        label="Font"
        value={deviceStyle.fontFamily}
        onChange={(v) => setStyle({ fontFamily: v })}
        options={[
          { value: "default", label: "Default" },
          { value: "sans", label: "Sans" },
          { value: "serif", label: "Serif" },
          { value: "mono", label: "Mono" },
          { value: "display", label: "Display" },
        ]}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberSliderField
          label="Heading size"
          value={numericStyleValue(deviceStyle.headingSizeValue, {
            default: 0,
            sm: 24,
            md: 32,
            lg: 44,
            xl: 56,
            "2xl": 72,
          }[deviceStyle.headingSize ?? "default"])}
          min={0}
          max={120}
          step={1}
          zeroLabel="Auto"
          onChange={(v) => setStyle({ headingSizeValue: v })}
        />
        <NumberSliderField
          label="Body size"
          value={numericStyleValue(deviceStyle.bodySizeValue, {
            default: 0,
            sm: 14,
            md: 16,
            lg: 20,
          }[deviceStyle.bodySize ?? "default"])}
          min={0}
          max={64}
          step={1}
          zeroLabel="Auto"
          onChange={(v) => setStyle({ bodySizeValue: v })}
        />
      </div>
      <NumberSliderField
        label="Radius"
        value={numericStyleValue(deviceStyle.borderRadiusValue, {
          none: 0,
          sm: 8,
          md: 12,
          lg: 20,
          xl: 32,
        }[deviceStyle.borderRadius ?? "none"])}
        min={0}
        max={80}
        step={1}
        onChange={(v) => setStyle({ borderRadiusValue: v })}
      />
      <div className="grid grid-cols-2 gap-2">
        <ChoiceField
          label="Border"
          value={style.border ?? "none"}
          onChange={(v) => onChange({ ...data, style: { ...style, border: v } })}
          options={[
            { value: "none", label: "None" },
            { value: "sm", label: "Thin" },
            { value: "md", label: "Thick" },
          ]}
        />
        <ChoiceField
          label="Shadow"
          value={style.shadow ?? "none"}
          onChange={(v) => onChange({ ...data, style: { ...style, shadow: v } })}
          options={[
            { value: "none", label: "None" },
            { value: "sm", label: "Small" },
            { value: "md", label: "Medium" },
            { value: "lg", label: "Large" },
            { value: "xl", label: "X-Large" },
          ]}
        />
      </div>
      {style.border && style.border !== "none" ? (
        <ColorField
          label="Border color"
          value={style.borderColor}
          onChange={(v) => onChange({ ...data, style: { ...style, borderColor: v } })}
          placeholder="#e4e4e7"
        />
      ) : null}
      <ChoiceField
        label="Text alignment"
        value={style.textAlign ?? "default"}
        onChange={(v) => onChange({ ...data, style: { ...style, textAlign: v } })}
        options={[
          { value: "default", label: "Default" },
          { value: "left", label: "Left" },
          { value: "center", label: "Center" },
          { value: "right", label: "Right" },
        ]}
      />
    </div>
  );
}

function numericStyleValue(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function AnimationForm({
  data,
  onChange,
  onReplay,
}: {
  data: Block["data"] & { motion?: BlockAnimation };
  onChange: (data: Block["data"] & { motion: BlockAnimation }) => void;
  onReplay?: () => void;
}) {
  // Blocks saved before this feature carry no `motion` key, so always resolve
  // through the schema rather than reading fields off raw data.
  const animation = resolveBlockAnimation(data.motion);
  const write = (patch: Partial<BlockAnimation>) =>
    onChange({ ...data, motion: { ...animation, ...patch } });
  /** Discrete picks - worth replaying so the choice is visible immediately. */
  const set = (patch: Partial<BlockAnimation>) => {
    write(patch);
    onReplay?.();
  };
  /**
   * Slider edits. These fire on every drag tick, and each replay remounts the
   * canvas wrappers, so they only update the value - the Putar button replays.
   */
  const tune = write;
  const hasEntrance = animation.preset !== "none";

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            Animasi
          </p>
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            Atur cara block ini muncul, bereaksi saat hover, dan bergerak
            mengikuti scroll.
          </p>
        </div>
        <button
          type="button"
          onClick={onReplay}
          disabled={!onReplay}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          title="Putar animasi di canvas"
        >
          <Play className="h-3 w-3" />
          Putar
        </button>
      </div>

      <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
          Efek masuk
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          {ANIMATION_PRESET_OPTIONS.map((option) => {
            const active = animation.preset === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => set({ preset: option.value })}
                title={option.hint}
                className={cn(
                  "rounded-lg border px-2 py-1.5 text-left transition-colors",
                  active
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
                )}
              >
                <span className="block text-[11px] font-medium leading-4">
                  {option.label}
                </span>
                <span
                  className={cn(
                    "block text-[10px] leading-4",
                    active
                      ? "text-zinc-300 dark:text-zinc-600"
                      : "text-zinc-400"
                  )}
                >
                  {option.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {hasEntrance ? (
        <>
          <ChoiceField
            label="Trigger"
            value={animation.trigger}
            onChange={(v) => set({ trigger: v })}
            options={[
              { value: "scroll", label: "Saat masuk layar" },
              { value: "load", label: "Saat halaman dibuka" },
            ]}
          />
          <NumberSliderField
            label="Durasi"
            value={animation.duration}
            min={0.1}
            max={3}
            step={0.05}
            unit="s"
            decimals={2}
            onChange={(v) => tune({ duration: v })}
          />
          <NumberSliderField
            label="Delay"
            value={animation.delay}
            min={0}
            max={2}
            step={0.05}
            unit="s"
            decimals={2}
            onChange={(v) => tune({ delay: v })}
          />
          <NumberSliderField
            label="Jarak gerak"
            value={animation.distance}
            min={0}
            max={200}
            step={2}
            onChange={(v) => tune({ distance: v })}
          />
          <ChoiceField
            label="Easing"
            value={animation.easing}
            onChange={(v) => set({ easing: v })}
            options={[
              { value: "smooth", label: "Smooth" },
              { value: "ease-out", label: "Ease out" },
              { value: "ease-in-out", label: "Ease in out" },
              { value: "linear", label: "Linear" },
              { value: "spring", label: "Spring" },
              { value: "bounce", label: "Bounce" },
            ]}
          />
          {animation.easing === "spring" || animation.easing === "bounce" ? (
            <p className="text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">
              Spring dan Bounce memakai fisika pegas, jadi durasi diabaikan.
              Delay tetap berlaku.
            </p>
          ) : null}
          {animation.trigger === "scroll" ? (
            <>
              <NumberSliderField
                label="Terlihat sebelum jalan"
                value={Math.round(animation.amount * 100)}
                min={0}
                max={100}
                step={5}
                unit="%"
                onChange={(v) => tune({ amount: v / 100 })}
              />
              <ToggleField
                label="Jalankan sekali saja"
                checked={animation.once}
                onChange={(v) => set({ once: v })}
                hint="Matikan agar animasi berulang tiap block masuk layar lagi."
              />
            </>
          ) : null}
        </>
      ) : null}

      <ChoiceField
        label="Efek hover"
        value={animation.hover}
        onChange={(v) => set({ hover: v })}
        options={[
          { value: "none", label: "Tidak ada" },
          { value: "lift", label: "Angkat" },
          { value: "grow", label: "Membesar" },
          { value: "shrink", label: "Mengecil" },
          { value: "tilt", label: "Miring" },
          { value: "glow", label: "Menyala" },
        ]}
      />
      <ChoiceField
        label="Gerak berulang"
        value={animation.loop}
        onChange={(v) => set({ loop: v })}
        options={[
          { value: "none", label: "Tidak ada" },
          { value: "float", label: "Melayang" },
          { value: "pulse", label: "Berdenyut" },
          { value: "sway", label: "Bergoyang" },
          { value: "breathe", label: "Bernapas" },
        ]}
      />

      <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
          Terhubung scroll
        </span>
        <p className="text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">
          Efek ini mengikuti posisi scroll secara langsung, bukan sekali jalan.
        </p>
      </div>
      <NumberSliderField
        label="Parallax"
        value={animation.parallax}
        min={-120}
        max={120}
        step={4}
        zeroLabel="Mati"
        onChange={(v) => tune({ parallax: v })}
      />
      <ToggleField
        label="Fade mengikuti scroll"
        checked={animation.scrollFade}
        onChange={(v) => set({ scrollFade: v })}
        hint="Block memudar di awal dan akhir jangkauan scroll-nya."
      />

      <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">
          Semua animasi otomatis dimatikan untuk pengunjung yang mengaktifkan
          <span className="font-medium"> reduce motion</span> di perangkatnya.
        </p>
        <button
          type="button"
          onClick={() => {
            onChange({ ...data, motion: { ...DEFAULT_BLOCK_ANIMATION } });
            onReplay?.();
          }}
          className="mt-2 flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          <RotateCcw className="h-3 w-3" />
          Reset ke default
        </button>
      </div>
    </div>
  );
}
