import Link from "next/link";
import {
  ArrowRight,
  ImageIcon,
  Layers3,
  type LucideIcon,
  Users,
} from "lucide-react";

import type { CollectionData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";
import { BlockImage } from "@/components/blocks/block-image";

export type ShowcaseKind = "products" | "courses" | "blog" | "memberships";

export type ShowcaseConfig = {
  kind: ShowcaseKind;
  label: string;
  ctaLabel: string;
  icon: LucideIcon;
};

type CollectionItem = CollectionData["items"][number];

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
  },
  soft: {
    section: "bg-zinc-50 text-zinc-950",
    muted: "text-zinc-600",
    eyebrow: "text-zinc-500",
    empty: "border-zinc-200 bg-white text-zinc-500",
  },
  dark: {
    section: "bg-zinc-950 text-white",
    muted: "text-zinc-300",
    eyebrow: "text-zinc-400",
    empty: "border-white/10 bg-white/5 text-zinc-400",
  },
  accent: {
    section: "bg-emerald-50 text-zinc-950",
    muted: "text-emerald-950/70",
    eyebrow: "text-emerald-700",
    empty: "border-emerald-200 bg-white/70 text-emerald-950/60",
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

const CARD_CLASS = {
  border: "border border-zinc-200 bg-white shadow-none dark:border-white/10 dark:bg-white/5",
  elevated:
    "border border-zinc-100 bg-white shadow-[0_18px_55px_-38px_rgba(24,24,27,0.65)] dark:border-white/10 dark:bg-white/[0.07]",
  plain: "border border-transparent bg-transparent shadow-none",
  inset:
    "border border-zinc-200 bg-zinc-50 shadow-inner dark:border-white/10 dark:bg-white/[0.04]",
};

export function ShowcaseBlock({
  data,
  config,
}: {
  data: CollectionData;
  config: ShowcaseConfig;
}) {
  const tone = data.tone ?? "light";
  const layout = data.layout ?? "grid";
  const width = data.width ?? "wide";
  const gap = data.gap ?? "normal";
  const columns = data.columns ?? 3;
  const align = data.align ?? "left";
  const items = data.items ?? [];
  const toneClass = TONE_CLASS[tone];
  const header = <ShowcaseHeader data={data} config={config} tone={tone} />;

  return (
    <section className={cn("px-6 py-16", toneClass.section)}>
      <div
        className={cn("mx-auto", WIDTH_CLASS[width], width === "full" && "px-0")}
      >
        {layout === "split" ? (
          <div
            className={cn(
              "grid gap-8 lg:grid-cols-[0.82fr_1.18fr]",
              align === "center" && "text-center lg:text-left"
            )}
          >
            <div>{header}</div>
            <ShowcaseBody data={data} items={items} config={config} layout="grid" />
          </div>
        ) : (
          <>
            <div className={cn("mb-8", align === "center" && "text-center")}>
              {header}
            </div>
            <ShowcaseBody
              data={data}
              items={items}
              config={config}
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

function ShowcaseHeader({
  data,
  config,
  tone,
}: {
  data: CollectionData;
  config: ShowcaseConfig;
  tone: NonNullable<CollectionData["tone"]>;
}) {
  const Icon = config.icon;
  const toneClass = TONE_CLASS[tone];
  const buttonStyle = data.buttonStyle ?? "outline";
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
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {data.eyebrow || config.label}
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

function ShowcaseBody({
  data,
  items,
  config,
  layout,
  columns = 3,
  gap = "normal",
}: {
  data: CollectionData;
  items: CollectionItem[];
  config: ShowcaseConfig;
  layout: NonNullable<CollectionData["layout"]>;
  columns?: NonNullable<CollectionData["columns"]>;
  gap?: NonNullable<CollectionData["gap"]>;
}) {
  if (items.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed p-8 text-center text-sm",
          TONE_CLASS[data.tone ?? "light"].empty
        )}
      >
        {data.emptyText || "Items will appear here once they are available."}
      </div>
    );
  }

  if (layout === "featured" && items.length > 1) {
    const [featured, ...rest] = items;
    return (
      <div className={cn("grid lg:grid-cols-[1.05fr_0.95fr]", GAP_CLASS[gap])}>
        <ShowcaseCard data={data} item={featured} config={config} featured />
        <div className={cn("grid sm:grid-cols-2", GAP_CLASS[gap])}>
          {rest.map((item, index) => (
            <ShowcaseCard
              key={`${item.title}-${index}`}
              data={data}
              item={item}
              config={config}
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
          <ShowcaseCard
            key={`${item.title}-${index}`}
            data={data}
            item={item}
            config={config}
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
          <ShowcaseCard
            key={`${item.title}-${index}`}
            data={data}
            item={item}
            config={config}
            horizontal
          />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("grid", GRID_CLASS[columns], GAP_CLASS[gap])}>
      {items.map((item, index) => (
        <ShowcaseCard
          key={`${item.title}-${index}`}
          data={data}
          item={item}
          config={config}
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

function ShowcaseCard({
  data,
  item,
  config,
  featured = false,
  compact = false,
  horizontal = false,
  className,
}: {
  data: CollectionData;
  item: CollectionItem;
  config: ShowcaseConfig;
  featured?: boolean;
  compact?: boolean;
  horizontal?: boolean;
  className?: string;
}) {
  const tone = data.tone ?? "light";
  const dark = tone === "dark";
  const cardStyle = data.cardStyle ?? "border";
  const imageAspect = data.imageAspect ?? "landscape";
  const showImage = data.showImages ?? true;
  const showBadge = data.showBadge ?? true;
  const showMeta = data.showMeta ?? true;
  const showDetail = data.showDetail ?? true;
  const showDescription = data.showDescription ?? true;
  const imageFit = data.imageFit ?? "cover";
  const ctaLabel = data.ctaLabel || config.ctaLabel;

  return (
    <Link
      href={item.href || "#"}
      className={cn(
        "group relative overflow-hidden rounded-xl transition hover:-translate-y-0.5",
        CARD_CLASS[cardStyle],
        cardStyle !== "plain" && "hover:border-zinc-300 hover:shadow-md dark:hover:border-white/20",
        horizontal && "grid grid-cols-[112px_1fr] sm:grid-cols-[152px_1fr]",
        className
      )}
    >
      {showImage ? (
        <div
          className={cn(
            "overflow-hidden bg-zinc-100 dark:bg-white/10",
            horizontal ? "h-full min-h-[132px]" : ASPECT_CLASS[imageAspect],
            featured && !horizontal && "lg:aspect-[16/11]"
          )}
        >
          {item.imageUrl ? (
            <BlockImage
              sizes={"(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"}
              src={item.imageUrl}
              alt=""
              className={cn(
                "h-full w-full transition duration-300 group-hover:scale-[1.03]",
                imageFit === "contain" ? "object-contain p-5" : "object-cover"
              )}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageIcon
                className={cn("h-8 w-8", dark ? "text-white/35" : "text-zinc-300")}
                aria-hidden="true"
              />
            </div>
          )}
        </div>
      ) : null}

      <div
        className={cn(
          "flex h-full flex-col",
          compact ? "p-4" : featured ? "p-6" : "p-5"
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          {showBadge && item.badge ? (
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium",
                dark ? "bg-white/10 text-zinc-200" : "bg-zinc-100 text-zinc-600"
              )}
            >
              {item.badge}
            </span>
          ) : (
            <span />
          )}
          {showMeta && item.meta ? (
            <span
              className={cn(
                "shrink-0 text-sm font-semibold",
                dark ? "text-white" : "text-zinc-950"
              )}
            >
              {item.meta}
            </span>
          ) : null}
        </div>

        <h3
          className={cn(
            "font-semibold tracking-tight group-hover:underline",
            featured ? "text-xl sm:text-2xl" : "text-base",
            dark ? "text-white" : "text-zinc-950"
          )}
        >
          {item.title}
        </h3>
        {showDescription && item.description ? (
          <p
            className={cn(
              "mt-2 leading-6",
              compact ? "text-xs" : "text-sm",
              dark ? "text-zinc-300" : "text-zinc-600"
            )}
          >
            {item.description}
          </p>
        ) : null}
        {showDetail && item.detail ? (
          <p
            className={cn(
              "mt-4 flex items-center gap-2 text-xs font-medium",
              dark ? "text-zinc-300" : "text-zinc-500"
            )}
          >
            {config.kind === "courses" ? (
              <Layers3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            <span>{item.detail}</span>
          </p>
        ) : null}
        <span
          className={cn(
            "mt-auto inline-flex pt-5 text-sm font-medium",
            dark ? "text-white" : "text-zinc-900"
          )}
        >
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
