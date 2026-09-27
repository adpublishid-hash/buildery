import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Check,
  ChevronRight,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Gift,
  Globe,
  Headphones,
  Heart,
  Instagram,
  Link as LinkIcon,
  LockKeyhole,
  Mail,
  MapPin,
  MessageCircle,
  MousePointerClick,
  Phone,
  Play,
  PlusCircle,
  Send,
  ShoppingBag,
  Sparkles,
  Star,
  UserPlus,
  Youtube,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { ButtonData, ButtonItem } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, LucideIcon> = {
  "arrow-right": ArrowRight,
  "arrow-up-right": ArrowUpRight,
  calendar: Calendar,
  check: Check,
  "chevron-right": ChevronRight,
  copy: Copy,
  card: CreditCard,
  download: Download,
  "external-link": ExternalLink,
  file: FileText,
  gift: Gift,
  globe: Globe,
  headphones: Headphones,
  heart: Heart,
  instagram: Instagram,
  link: LinkIcon,
  lock: LockKeyhole,
  mail: Mail,
  map: MapPin,
  message: MessageCircle,
  phone: Phone,
  play: Play,
  plus: PlusCircle,
  send: Send,
  shop: ShoppingBag,
  sparkles: Sparkles,
  star: Star,
  user: UserPlus,
  youtube: Youtube,
  zap: Zap,
};

const SIZE_CLASS = {
  sm: "h-9 px-3.5 text-xs",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-base",
  xl: "h-14 px-8 text-base",
};

const SHAPE_CLASS = {
  rounded: "rounded-lg",
  pill: "rounded-full",
  square: "rounded-none",
};

const WIDTH_CLASS = {
  narrow: "max-w-2xl",
  wide: "max-w-4xl",
  full: "max-w-none",
};

const TONE_CLASS = {
  plain: "bg-transparent",
  soft: "bg-zinc-50",
  light: "bg-white",
  dark: "bg-zinc-950 text-white",
  accent: "bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50",
};

const GAP_CLASS = {
  tight: "gap-2",
  normal: "gap-3",
  loose: "gap-4",
};

const COLOR_SOLID: Record<NonNullable<ButtonItem["color"]>, string> = {
  accent: "bg-[var(--bd-accent,#18181b)] text-white",
  neutral: "bg-zinc-900 text-white",
  primary: "bg-indigo-600 text-white",
  success: "bg-emerald-600 text-white",
  warning: "bg-amber-500 text-zinc-950",
  danger: "bg-rose-600 text-white",
  custom: "bg-zinc-900 text-white",
};

const COLOR_SOFT: Record<NonNullable<ButtonItem["color"]>, string> = {
  accent: "bg-zinc-100 text-zinc-900",
  neutral: "bg-zinc-100 text-zinc-900",
  primary: "bg-indigo-50 text-indigo-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-rose-50 text-rose-700",
  custom: "bg-zinc-100 text-zinc-900",
};

const COLOR_OUTLINE: Record<NonNullable<ButtonItem["color"]>, string> = {
  accent: "border-zinc-300 text-zinc-900",
  neutral: "border-zinc-300 text-zinc-900",
  primary: "border-indigo-300 text-indigo-700",
  success: "border-emerald-300 text-emerald-700",
  warning: "border-amber-300 text-amber-700",
  danger: "border-rose-300 text-rose-700",
  custom: "border-zinc-300 text-zinc-900",
};

const COLOR_GHOST: Record<NonNullable<ButtonItem["color"]>, string> = {
  accent: "text-zinc-900 hover:bg-zinc-100",
  neutral: "text-zinc-900 hover:bg-zinc-100",
  primary: "text-indigo-700 hover:bg-indigo-50",
  success: "text-emerald-700 hover:bg-emerald-50",
  warning: "text-amber-700 hover:bg-amber-50",
  danger: "text-rose-700 hover:bg-rose-50",
  custom: "text-zinc-900 hover:bg-zinc-100",
};

const COLOR_GRADIENT: Record<NonNullable<ButtonItem["color"]>, string> = {
  accent: "bg-gradient-to-r from-zinc-950 to-zinc-700 text-white",
  neutral: "bg-gradient-to-r from-zinc-900 to-zinc-600 text-white",
  primary: "bg-gradient-to-r from-indigo-600 to-sky-500 text-white",
  success: "bg-gradient-to-r from-emerald-600 to-teal-500 text-white",
  warning: "bg-gradient-to-r from-amber-400 to-orange-500 text-zinc-950",
  danger: "bg-gradient-to-r from-rose-600 to-pink-500 text-white",
  custom: "bg-gradient-to-r from-zinc-900 to-zinc-600 text-white",
};

const COLOR_GLASS: Record<NonNullable<ButtonItem["color"]>, string> = {
  accent: "border border-white/25 bg-white/15 text-white backdrop-blur hover:bg-white/20",
  neutral: "border border-zinc-200 bg-white/70 text-zinc-900 backdrop-blur hover:bg-white",
  primary: "border border-indigo-200 bg-indigo-50/70 text-indigo-700 backdrop-blur hover:bg-indigo-50",
  success: "border border-emerald-200 bg-emerald-50/70 text-emerald-700 backdrop-blur hover:bg-emerald-50",
  warning: "border border-amber-200 bg-amber-50/70 text-amber-700 backdrop-blur hover:bg-amber-50",
  danger: "border border-rose-200 bg-rose-50/70 text-rose-700 backdrop-blur hover:bg-rose-50",
  custom: "border border-zinc-200 bg-white/70 text-zinc-900 backdrop-blur hover:bg-white",
};

function buttonClassName(item: ButtonItem) {
  const color = item.color ?? "accent";
  switch (item.variant ?? "solid") {
    case "soft":
      return COLOR_SOFT[color];
    case "outline":
      return cn("border bg-transparent", COLOR_OUTLINE[color]);
    case "ghost":
      return cn("bg-transparent", COLOR_GHOST[color]);
    case "link":
      return cn(
        "h-auto !px-0 !py-0 underline-offset-4 hover:underline",
        COLOR_GHOST[color]
      );
    case "gradient":
      return COLOR_GRADIENT[color];
    case "glass":
      return COLOR_GLASS[color];
    default:
      return COLOR_SOLID[color];
  }
}

function buttonInlineStyle(item: ButtonItem): React.CSSProperties | undefined {
  if (item.color !== "custom") return undefined;
  const style: React.CSSProperties = {};
  if (item.customColor) {
    if (item.variant === "outline" || item.variant === "ghost" || item.variant === "link") {
      style.borderColor = item.customColor;
      style.color = item.customTextColor || item.customColor;
    } else if (item.variant === "soft") {
      style.backgroundColor = `${item.customColor}1a`;
      style.color = item.customTextColor || item.customColor;
    } else {
      style.backgroundColor = item.customColor;
      style.color = item.customTextColor || "#ffffff";
    }
  }
  return Object.keys(style).length ? style : undefined;
}

export function ButtonBlock({ data }: { data: ButtonData }) {
  const layout = data.layout ?? "inline";
  const size = data.size ?? "md";
  const shape = data.shape ?? "rounded";
  const tone = data.tone ?? "plain";
  const align = data.align ?? "center";
  const gap = data.gap ?? "normal";
  const containerStyle = data.containerStyle ?? "plain";
  const headerPlacement = data.headerPlacement ?? "top";
  const showIcons = data.showIcons ?? true;
  const showDescriptions = data.showDescriptions ?? false;
  const showMeta = data.showMeta ?? false;
  const showArrows = data.showArrows ?? false;
  const showShadow = data.showShadow ?? true;
  const equalWidth = data.equalWidth ?? false;
  const mobileStack = data.mobileStack ?? true;
  const fullWidthButtons =
    data.fullWidthButtons ??
    (layout === "linktree" || layout === "stacked" || layout === "cards");
  const animation = data.animation ?? "none";
  const items = (data.items ?? []).filter(Boolean);
  const headingAlign = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  }[align];

  const containerLayout =
    layout === "stacked" || layout === "linktree"
      ? cn("flex flex-col", GAP_CLASS[gap])
      : layout === "banner"
        ? cn("flex flex-col items-stretch sm:flex-row sm:flex-wrap", GAP_CLASS[gap])
      : layout === "toolbar"
        ? cn("inline-flex max-w-full flex-wrap items-center rounded-xl border border-zinc-200 bg-white p-1 shadow-sm", GAP_CLASS.tight)
      : layout === "grid" || layout === "cards"
        ? cn(
            "grid",
            GAP_CLASS[gap],
            data.columns === 3
              ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3"
              : data.columns === 1
                ? "grid-cols-1"
                : "grid-cols-1 sm:grid-cols-2"
          )
        : layout === "split"
          ? cn("flex flex-col items-stretch sm:flex-row sm:flex-wrap", GAP_CLASS[gap])
          : layout === "social"
            ? cn("flex flex-wrap items-center", GAP_CLASS[gap])
            : cn(
                "flex items-center",
                mobileStack ? "flex-col sm:flex-row sm:flex-wrap" : "flex-wrap",
                GAP_CLASS[gap]
              );

  const justifyClass =
    layout === "inline" || layout === "split" || layout === "banner" || layout === "toolbar"
      ? align === "center"
        ? "justify-center"
        : align === "right"
          ? "justify-end"
          : "justify-start"
      : "";

  const isLinktree = layout === "linktree";
  const isCardLayout = layout === "cards";
  const isSocialLayout = layout === "social";
  const inlineHeader = layout === "banner" || headerPlacement === "inline";
  const hasHeader = Boolean(data.eyebrow || data.heading || data.description);
  const containerChrome = {
    plain: "",
    panel: "rounded-2xl bg-zinc-50 p-5 md:p-6",
    bordered: "rounded-2xl border border-zinc-200 bg-white p-5 md:p-6 shadow-sm",
    glass:
      "rounded-2xl border border-white/40 bg-white/70 p-5 shadow-xl shadow-zinc-200/70 backdrop-blur md:p-6",
  }[containerStyle];

  return (
    <section
      className={cn(
        "px-6 py-12 md:px-10",
        tone !== "plain" && TONE_CLASS[tone],
        tone === "dark" && "text-white"
      )}
    >
      <div className={cn("mx-auto", WIDTH_CLASS[data.width ?? "wide"])}>
        <div
          className={cn(
            containerChrome,
            inlineHeader && hasHeader && "grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center",
            layout === "banner" && containerStyle === "plain" && "rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
          )}
        >
        {hasHeader && (
          <div className={cn(inlineHeader ? "" : "mb-6", headingAlign)}>
            {data.eyebrow ? (
              <p
                className={cn(
                  "text-xs font-semibold uppercase tracking-widest",
                  tone === "dark" ? "text-zinc-300" : "text-zinc-500"
                )}
              >
                {data.eyebrow}
              </p>
            ) : null}
            {data.heading ? (
              <h2
                className={cn(
                  "mt-2 text-2xl font-semibold tracking-tight md:text-3xl",
                  tone === "dark" ? "text-white" : "text-zinc-950"
                )}
              >
                {data.heading}
              </h2>
            ) : null}
            {data.description ? (
              <p
                className={cn(
                  "mt-2 text-sm md:text-base",
                  tone === "dark" ? "text-zinc-300" : "text-zinc-600"
                )}
              >
                {data.description}
              </p>
            ) : null}
          </div>
        )}

        <div className={cn(containerLayout, justifyClass, inlineHeader && "md:justify-end")}>
          {items.map((item, index) => {
            const Icon = item.icon ? ICON_MAP[item.icon] : null;
            const buttonClass = buttonClassName(item);
            const variant = item.variant ?? "solid";
            const itemSize =
              item.sizeOverride && item.sizeOverride !== "default"
                ? item.sizeOverride
                : size;
            const isFullWidth = fullWidthButtons || isLinktree || isCardLayout;
            const showDesc =
              (showDescriptions || isLinktree || isCardLayout) &&
              Boolean(item.description);
            const showSmallMeta =
              (showMeta || isLinktree || isCardLayout) && Boolean(item.meta);
            const iconRight = item.iconPosition === "right";
            const rel = [
              item.openInNewTab ? "noopener noreferrer" : "",
              item.noFollow ? "nofollow" : "",
            ]
              .filter(Boolean)
              .join(" ");

            const animationClass =
              animation === "lift"
                ? "transition-transform hover:-translate-y-0.5"
                : animation === "shine"
                  ? "transition-transform hover:scale-[1.02]"
                  : animation === "pulse"
                    ? item.highlighted
                      ? "animate-pulse"
                      : ""
                    : "transition-colors";

            return (
              <Link
                key={`${item.label}-${index}`}
                href={item.href || "#"}
                target={item.openInNewTab ? "_blank" : undefined}
                rel={rel || undefined}
                aria-label={item.ariaLabel || undefined}
                className={cn(
                  "group relative inline-flex items-center font-medium",
                  SIZE_CLASS[itemSize],
                  SHAPE_CLASS[shape],
                  buttonClass,
                  animationClass,
                  isFullWidth && "w-full",
                  equalWidth && "flex-1",
                  isLinktree && "h-auto min-h-[3.5rem] px-5 py-3.5",
                  isCardLayout && "h-auto min-h-[5rem] items-start px-5 py-4",
                  layout === "toolbar" && "h-9 rounded-lg px-3",
                  isSocialLayout && "h-10 px-3.5",
                  showDesc || showSmallMeta
                    ? "justify-start gap-3 text-left"
                    : "justify-center gap-2",
                  (variant === "solid" || variant === "gradient") && showShadow && "shadow-sm hover:shadow-md",
                  variant === "outline" && "hover:bg-zinc-50",
                  isCardLayout && showShadow && "shadow-sm hover:shadow-md",
                  item.highlighted && variant === "solid" && "ring-2 ring-offset-2 ring-offset-white ring-zinc-900/10",
                  variant === "link" && "shadow-none"
                )}
                style={buttonInlineStyle(item)}
              >
                {showIcons && Icon && !iconRight ? (
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      (isLinktree || isCardLayout) && "h-5 w-5"
                    )}
                    aria-hidden="true"
                  />
                ) : null}
                <span
                  className={cn(
                    "flex min-w-0",
                    showDesc || showSmallMeta
                      ? "flex-1 flex-col"
                      : "items-center",
                    isSocialLayout && Icon && "sr-only"
                  )}
                >
                  {showSmallMeta ? (
                    <span
                      className={cn(
                        "mb-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        variant === "solid" ? "text-white/70" : "text-zinc-400"
                      )}
                    >
                      {item.meta}
                    </span>
                  ) : null}
                  <span className={cn("flex items-center gap-2 truncate", (showDesc || showSmallMeta) && "text-sm font-semibold")}>
                    {item.label || "Click me"}
                    {item.badge ? (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          variant === "solid"
                            ? "bg-white/20 text-white"
                            : "bg-zinc-900 text-white"
                        )}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </span>
                  {showDesc ? (
                    <span
                      className={cn(
                        "mt-0.5 truncate text-xs font-normal",
                        variant === "solid"
                          ? "text-white/80"
                          : "text-zinc-500"
                      )}
                    >
                      {item.description}
                    </span>
                  ) : null}
                </span>
                {(isLinktree || layout === "split") && (
                  <ArrowUpRight
                    className={cn(
                      "ml-2 h-4 w-4 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    )}
                    aria-hidden="true"
                  />
                )}
                {showArrows && !isLinktree && layout !== "split" ? (
                  <ArrowRight className="ml-1 h-4 w-4 shrink-0 opacity-70 transition-transform group-hover:translate-x-0.5" />
                ) : null}
                {showIcons && Icon && iconRight ? (
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                ) : null}
              </Link>
            );
          })}

          {items.length === 0 ? (
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm",
                tone === "dark"
                  ? "border-white/20 text-zinc-300"
                  : "border-zinc-200 text-zinc-500"
              )}
            >
              <MousePointerClick className="h-4 w-4" aria-hidden="true" />
              Add a button to get started.
            </div>
          ) : null}
        </div>

        {data.footnote ? (
          <p
            className={cn(
              "mt-4 text-xs",
              headingAlign,
              tone === "dark" ? "text-zinc-400" : "text-zinc-500"
            )}
          >
            {data.footnote}
          </p>
        ) : null}
        </div>
      </div>
    </section>
  );
}
