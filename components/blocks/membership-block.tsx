import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Crown,
  Gem,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import type { CollectionData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";
import { BlockImage } from "@/components/blocks/block-image";

type MembershipItem = CollectionData["items"][number];

const WIDTH_CLASS = {
  narrow: "max-w-4xl",
  wide: "max-w-6xl",
  full: "max-w-none",
};

const GRID_CLASS = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
};

const GAP_CLASS = {
  tight: "gap-3",
  normal: "gap-5",
  loose: "gap-8",
};

const ASPECT_CLASS = {
  landscape: "aspect-[16/10]",
  square: "aspect-square",
  portrait: "aspect-[4/5]",
};

const TONE_CLASS = {
  light: {
    section: "bg-white text-zinc-950",
    muted: "text-zinc-600",
    eyebrow: "text-zinc-500",
    empty: "border-zinc-200 bg-zinc-50 text-zinc-500",
    card: "border-zinc-200 bg-white",
    chip: "bg-zinc-100 text-zinc-700",
    accent: "bg-zinc-950 text-white",
  },
  soft: {
    section: "bg-cyan-50 text-zinc-950",
    muted: "text-cyan-950/70",
    eyebrow: "text-cyan-700",
    empty: "border-cyan-200 bg-white/80 text-cyan-950/60",
    card: "border-cyan-100 bg-white",
    chip: "bg-cyan-100 text-cyan-800",
    accent: "bg-zinc-950 text-white",
  },
  dark: {
    section: "bg-zinc-950 text-white",
    muted: "text-zinc-300",
    eyebrow: "text-cyan-300",
    empty: "border-white/10 bg-white/5 text-zinc-400",
    card: "border-white/10 bg-white/[0.07]",
    chip: "bg-white/10 text-zinc-200",
    accent: "bg-white text-zinc-950",
  },
  accent: {
    section: "bg-emerald-50 text-zinc-950",
    muted: "text-emerald-950/70",
    eyebrow: "text-emerald-700",
    empty: "border-emerald-200 bg-white/75 text-emerald-950/60",
    card: "border-emerald-100 bg-white",
    chip: "bg-emerald-100 text-emerald-800",
    accent: "bg-zinc-950 text-white",
  },
};

const BUTTON_CLASS = {
  solid:
    "border-transparent bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100",
  soft:
    "border-transparent bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/15",
  outline:
    "border-zinc-200 bg-white/80 text-zinc-800 hover:bg-white dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10",
};

const CARD_STYLE_CLASS = {
  border: "shadow-none",
  elevated: "shadow-[0_24px_70px_-46px_rgba(15,23,42,0.78)]",
  plain: "border-transparent bg-transparent shadow-none",
  inset: "shadow-inner",
};

export function MembershipBlock({ data }: { data: CollectionData }) {
  const tone = data.tone ?? "soft";
  const layout = data.layout ?? "featured";
  const width = data.width ?? "wide";
  const gap = data.gap ?? "normal";
  const columns = data.columns ?? 3;
  const align = data.align ?? "left";
  const items = data.items ?? [];
  const toneClass = TONE_CLASS[tone];
  const header = <MembershipHeader data={data} tone={tone} />;

  return (
    <section className={cn("px-6 py-16", toneClass.section)}>
      <div
        className={cn("mx-auto", WIDTH_CLASS[width], width === "full" && "px-0")}
      >
        {layout === "split" ? (
          <div
            className={cn(
              "grid gap-8 lg:grid-cols-[0.78fr_1.22fr]",
              align === "center" && "text-center lg:text-left"
            )}
          >
            <div>{header}</div>
            <MembershipBody data={data} items={items} layout="grid" />
          </div>
        ) : (
          <>
            <div className={cn("mb-8", align === "center" && "text-center")}>
              {header}
            </div>
            <MembershipBody
              data={data}
              items={items}
              layout={layout}
              columns={columns}
              gap={gap}
            />
          </>
        )}
      </div>
    </section>
  );
}

function MembershipHeader({
  data,
  tone,
}: {
  data: CollectionData;
  tone: NonNullable<CollectionData["tone"]>;
}) {
  const toneClass = TONE_CLASS[tone];
  const buttonStyle = data.buttonStyle ?? "solid";
  const align = data.align ?? "left";

  return (
    <div
      className={cn(
        "flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between",
        align === "center" && "items-center sm:flex-col sm:items-center"
      )}
    >
      <div className={cn("max-w-2xl", align === "center" && "mx-auto")}>
        <p
          className={cn(
            "inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider",
            toneClass.eyebrow
          )}
        >
          <Crown className="h-3.5 w-3.5" aria-hidden="true" />
          {data.eyebrow || "Membership"}
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          {data.heading}
        </h2>
        {data.subheading ? (
          <p className={cn("mt-3 text-sm leading-6", toneClass.muted)}>
            {data.subheading}
          </p>
        ) : null}
      </div>
      {data.buttonLabel ? (
        <Link
          href={data.buttonHref || "#"}
          className={cn(
            "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition",
            BUTTON_CLASS[buttonStyle]
          )}
        >
          {data.buttonLabel}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

function MembershipBody({
  data,
  items,
  layout,
  columns = 3,
  gap = "normal",
}: {
  data: CollectionData;
  items: MembershipItem[];
  layout: NonNullable<CollectionData["layout"]>;
  columns?: NonNullable<CollectionData["columns"]>;
  gap?: NonNullable<CollectionData["gap"]>;
}) {
  if (items.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed p-8 text-center text-sm",
          TONE_CLASS[data.tone ?? "soft"].empty
        )}
      >
        {data.emptyText || "Paket membership aktif akan otomatis muncul di sini."}
      </div>
    );
  }

  if (layout === "featured" && items.length > 1) {
    const [featured, ...rest] = items;
    return (
      <div className={cn("grid lg:grid-cols-[1.04fr_0.96fr]", GAP_CLASS[gap])}>
        <MembershipCard data={data} item={featured} featured />
        <div className={cn("grid sm:grid-cols-2", GAP_CLASS[gap])}>
          {rest.map((item, index) => (
            <MembershipCard
              key={`${item.title}-${index}`}
              data={data}
              item={item}
              compact={data.compact}
            />
          ))}
        </div>
      </div>
    );
  }

  if (layout === "carousel") {
    return (
      <div className="-mx-6 flex snap-x gap-4 overflow-x-auto px-6 pb-3">
        {items.map((item, index) => (
          <MembershipCard
            key={`${item.title}-${index}`}
            data={data}
            item={item}
            className="w-[78vw] shrink-0 snap-start sm:w-[360px]"
          />
        ))}
      </div>
    );
  }

  if (layout === "compact") {
    return (
      <div className={cn("grid", GAP_CLASS[gap])}>
        {items.map((item, index) => (
          <MembershipCard
            key={`${item.title}-${index}`}
            data={data}
            item={item}
            horizontal
          />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("grid", GRID_CLASS[columns], GAP_CLASS[gap])}>
      {items.map((item, index) => (
        <MembershipCard
          key={`${item.title}-${index}`}
          data={data}
          item={item}
          featured={Boolean(data.highlightFirst && index === 0 && columns > 2)}
          compact={data.compact}
          className={cn(
            data.highlightFirst && index === 0 && columns > 2 && "md:col-span-2"
          )}
        />
      ))}
    </div>
  );
}

function MembershipCard({
  data,
  item,
  featured = false,
  compact = false,
  horizontal = false,
  className,
}: {
  data: CollectionData;
  item: MembershipItem;
  featured?: boolean;
  compact?: boolean;
  horizontal?: boolean;
  className?: string;
}) {
  const tone = data.tone ?? "soft";
  const dark = tone === "dark";
  const toneClass = TONE_CLASS[tone];
  const cardStyle = data.cardStyle ?? "elevated";
  const imageAspect = data.imageAspect ?? "landscape";
  const showImage = data.showImages ?? true;
  const showBadge = data.showBadge ?? true;
  const showMeta = data.showMeta ?? true;
  const showDetail = data.showDetail ?? true;
  const showDescription = data.showDescription ?? true;
  const imageFit = data.imageFit ?? "cover";
  const ctaLabel = data.ctaLabel || "Lihat benefit";
  const details = splitDetail(item.detail);

  return (
    <Link
      href={item.href || "#"}
      className={cn(
        "group relative overflow-hidden rounded-xl border transition hover:-translate-y-0.5 hover:shadow-lg",
        toneClass.card,
        CARD_STYLE_CLASS[cardStyle],
        horizontal && "grid grid-cols-[118px_1fr] sm:grid-cols-[168px_1fr]",
        className
      )}
    >
      {showImage ? (
        <div
          className={cn(
            "relative overflow-hidden bg-cyan-100/70 dark:bg-white/10",
            horizontal ? "h-full min-h-[142px]" : ASPECT_CLASS[imageAspect],
            featured && !horizontal && "lg:aspect-[16/11]"
          )}
        >
          {item.imageUrl ? (
            <BlockImage
              sizes={"(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"}
              src={item.imageUrl}
              alt=""
              className={cn(
                "h-full w-full transition duration-300 group-hover:scale-[1.035]",
                imageFit === "contain" ? "object-contain p-5" : "object-cover"
              )}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Gem
                className={cn("h-9 w-9", dark ? "text-white/35" : "text-cyan-300")}
                aria-hidden="true"
              />
            </div>
          )}
          {showBadge && item.badge ? (
            <span
              className={cn(
                "absolute left-3 top-3 inline-flex max-w-[calc(100%-24px)] items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm backdrop-blur",
                dark ? "bg-zinc-950/70 text-white" : "bg-white/90 text-zinc-800"
              )}
            >
              <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{levelLabel(item.badge)}</span>
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "flex h-full flex-col",
          compact ? "p-4" : featured ? "p-6" : "p-5"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3
              className={cn(
                "font-semibold tracking-tight group-hover:underline",
                featured ? "text-xl sm:text-2xl" : "text-base",
                dark ? "text-white" : "text-zinc-950"
              )}
            >
              {item.title}
            </h3>
            {showBadge && !showImage && item.badge ? (
              <p className={cn("mt-1 text-xs font-medium", toneClass.muted)}>
                {levelLabel(item.badge)}
              </p>
            ) : null}
          </div>
          {showMeta && item.meta ? (
            <span
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold",
                toneClass.accent
              )}
            >
              {item.meta}
            </span>
          ) : null}
        </div>

        {showDescription && item.description ? (
          <p
            className={cn(
              "mt-3 leading-6",
              compact ? "text-xs" : "text-sm",
              toneClass.muted
            )}
          >
            {item.description}
          </p>
        ) : null}

        {showDetail && details.length > 0 ? (
          <div className="mt-5 grid gap-2">
            {details.slice(0, 3).map((detail, index) => {
              const Icon =
                index === 0 ? CreditCard : index === 1 ? Users : CheckCircle2;
              return (
                <span
                  key={`${detail}-${index}`}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium",
                    toneClass.chip
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{detail}</span>
                </span>
              );
            })}
          </div>
        ) : null}

        <span
          className={cn(
            "mt-auto inline-flex pt-5 text-sm font-medium",
            dark ? "text-white" : "text-zinc-900"
          )}
        >
          <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
          {ctaLabel}
          <ArrowRight
            className="ml-2 h-4 w-4 transition group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </div>
    </Link>
  );
}

function splitDetail(detail: string) {
  return detail
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function levelLabel(level: string) {
  if (level === "FREE") return "Free access";
  if (level === "BASIC") return "Basic member";
  if (level === "PREMIUM") return "Premium member";
  return level;
}
