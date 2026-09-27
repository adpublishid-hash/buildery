import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  GraduationCap,
  Layers3,
  PlayCircle,
  Sparkles,
  Users,
} from "lucide-react";

import type { CollectionData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";
import { BlockImage } from "@/components/blocks/block-image";

type CourseItem = CollectionData["items"][number];

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
    accent: "bg-sky-50 text-sky-800",
  },
  soft: {
    section: "bg-sky-50 text-zinc-950",
    muted: "text-slate-600",
    eyebrow: "text-sky-700",
    empty: "border-sky-200 bg-white/80 text-slate-500",
    card: "border-sky-100 bg-white",
    chip: "bg-slate-100 text-slate-700",
    accent: "bg-sky-100 text-sky-800",
  },
  dark: {
    section: "bg-zinc-950 text-white",
    muted: "text-zinc-300",
    eyebrow: "text-sky-300",
    empty: "border-white/10 bg-white/5 text-zinc-400",
    card: "border-white/10 bg-white/[0.07]",
    chip: "bg-white/10 text-zinc-200",
    accent: "bg-sky-400/15 text-sky-100",
  },
  accent: {
    section: "bg-indigo-50 text-zinc-950",
    muted: "text-indigo-950/70",
    eyebrow: "text-indigo-700",
    empty: "border-indigo-200 bg-white/75 text-indigo-950/60",
    card: "border-indigo-100 bg-white",
    chip: "bg-indigo-100 text-indigo-800",
    accent: "bg-zinc-950 text-white",
  },
};

const BUTTON_CLASS = {
  solid:
    "border-transparent bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100",
  soft:
    "border-transparent bg-white/80 text-zinc-900 hover:bg-white dark:bg-white/10 dark:text-white dark:hover:bg-white/15",
  outline:
    "border-zinc-200 bg-white/80 text-zinc-800 hover:bg-white dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10",
};

const CARD_STYLE_CLASS = {
  border: "shadow-none",
  elevated: "shadow-[0_24px_70px_-46px_rgba(15,23,42,0.72)]",
  plain: "border-transparent bg-transparent shadow-none",
  inset: "shadow-inner",
};

export function KursusBlock({ data }: { data: CollectionData }) {
  const tone = data.tone ?? "soft";
  const layout = data.layout ?? "featured";
  const width = data.width ?? "wide";
  const gap = data.gap ?? "normal";
  const columns = data.columns ?? 3;
  const align = data.align ?? "left";
  const items = data.items ?? [];
  const toneClass = TONE_CLASS[tone];
  const header = <CourseHeader data={data} tone={tone} />;

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
            <CourseBody data={data} items={items} layout="grid" />
          </div>
        ) : (
          <>
            <div className={cn("mb-8", align === "center" && "text-center")}>
              {header}
            </div>
            <CourseBody
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

function CourseHeader({
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
          <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
          {data.eyebrow || "Kursus"}
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

function CourseBody({
  data,
  items,
  layout,
  columns = 3,
  gap = "normal",
}: {
  data: CollectionData;
  items: CourseItem[];
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
        {data.emptyText || "Kursus aktif akan otomatis muncul di sini."}
      </div>
    );
  }

  if (layout === "featured" && items.length > 1) {
    const [featured, ...rest] = items;
    return (
      <div className={cn("grid lg:grid-cols-[1.06fr_0.94fr]", GAP_CLASS[gap])}>
        <CourseCard data={data} item={featured} featured />
        <div className={cn("grid sm:grid-cols-2", GAP_CLASS[gap])}>
          {rest.map((item, index) => (
            <CourseCard
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
          <CourseCard
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
          <CourseCard
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
        <CourseCard
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

function CourseCard({
  data,
  item,
  featured = false,
  compact = false,
  horizontal = false,
  className,
}: {
  data: CollectionData;
  item: CourseItem;
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
  const ctaLabel = data.ctaLabel || "Mulai belajar";
  const detailParts = splitDetail(item.detail);

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
            "relative overflow-hidden bg-slate-100 dark:bg-white/10",
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
              <BookOpen
                className={cn("h-9 w-9", dark ? "text-white/35" : "text-slate-300")}
                aria-hidden="true"
              />
            </div>
          )}
          <span
            className={cn(
              "absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm backdrop-blur",
              dark ? "bg-zinc-950/70 text-white" : "bg-white/90 text-slate-800"
            )}
          >
            <PlayCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
            Online course
          </span>
          {showBadge && item.badge ? (
            <span
              className={cn(
                "absolute right-3 top-3 inline-flex max-w-[calc(100%-24px)] items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm backdrop-blur",
                item.badge.toLowerCase().includes("gratis")
                  ? "bg-emerald-500 text-white"
                  : dark
                    ? "bg-sky-400 text-zinc-950"
                    : "bg-zinc-950 text-white"
              )}
            >
              <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.badge}</span>
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
          <h3
            className={cn(
              "font-semibold tracking-tight group-hover:underline",
              featured ? "text-xl sm:text-2xl" : "text-base",
              dark ? "text-white" : "text-zinc-950"
            )}
          >
            {item.title}
          </h3>
          {showMeta && item.meta ? (
            <span
              className={cn(
                "shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold",
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
              "mt-2 leading-6",
              compact ? "text-xs" : "text-sm",
              toneClass.muted
            )}
          >
            {item.description}
          </p>
        ) : null}

        {showDetail && detailParts.length > 0 ? (
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {detailParts.slice(0, 3).map((part, index) => {
              const Icon =
                index === 0 ? Layers3 : index === 1 ? BookOpen : Users;
              return (
                <span
                  key={`${part}-${index}`}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium",
                    toneClass.chip
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{part}</span>
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
