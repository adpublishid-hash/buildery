import type { GalleryData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";
import { Lightbox } from "./lightbox";
import { BlockImage } from "@/components/blocks/block-image";

const COLUMNS: Record<GalleryData["columns"], string> = {
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

const MASONRY_COLUMNS: Record<GalleryData["columns"], string> = {
  2: "lg:columns-2",
  3: "lg:columns-3",
  4: "lg:columns-4",
};

const GAPS: Record<GalleryData["gap"], string> = {
  sm: "gap-3",
  md: "gap-4",
  lg: "gap-6",
};

const MASONRY_GAPS: Record<GalleryData["gap"], string> = {
  sm: "gap-3 [column-gap:0.75rem]",
  md: "gap-4 [column-gap:1rem]",
  lg: "gap-6 [column-gap:1.5rem]",
};

const ASPECTS: Record<GalleryData["aspectRatio"], string> = {
  auto: "",
  video: "aspect-video",
  square: "aspect-square",
  portrait: "aspect-[4/5]",
  wide: "aspect-[21/9]",
};

type GalleryItem = GalleryData["items"][number];

export function GalleryBlock({ data }: { data: GalleryData }) {
  const layout = data.layout ?? "grid";
  const items = data.items.filter((item) => item.url);
  const align = data.align ?? "center";

  return (
    <section className="px-6 py-16 md:px-10">
      <div className="mx-auto max-w-6xl">
        {data.eyebrow || data.heading || data.subheading ? (
          <div
            className={cn(
              "max-w-2xl",
              align === "center" && "mx-auto text-center",
              align === "left" && "mr-auto text-left"
            )}
          >
            {data.eyebrow ? (
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                {data.eyebrow}
              </p>
            ) : null}
            {data.heading ? (
              <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 md:text-4xl">
                {data.heading}
              </h2>
            ) : null}
            {data.subheading ? (
              <p className="mt-3 text-base leading-relaxed text-zinc-500">
                {data.subheading}
              </p>
            ) : null}
          </div>
        ) : null}

        {items.length === 0 ? (
          <div className="mt-10 flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-zinc-300 text-sm text-zinc-400">
            Add images to this gallery
          </div>
        ) : layout === "masonry" ? (
          <MasonryGallery data={data} items={items} />
        ) : layout === "featured" ? (
          <FeaturedGallery data={data} items={items} />
        ) : layout === "strip" ? (
          <StripGallery data={data} items={items} />
        ) : (
          <GridGallery data={data} items={items} />
        )}
      </div>
    </section>
  );
}

function GridGallery({
  data,
  items,
}: {
  data: GalleryData;
  items: GalleryItem[];
}) {
  return (
    <div
      className={cn(
        "mt-10 grid sm:grid-cols-2",
        COLUMNS[data.columns],
        GAPS[data.gap]
      )}
    >
      {items.map((item, index) => (
        <GalleryTile key={`${item.url}-${index}`} data={data} item={item} />
      ))}
    </div>
  );
}

function MasonryGallery({
  data,
  items,
}: {
  data: GalleryData;
  items: GalleryItem[];
}) {
  return (
    <div
      className={cn(
        "mt-10 columns-1 sm:columns-2",
        MASONRY_COLUMNS[data.columns],
        MASONRY_GAPS[data.gap]
      )}
    >
      {items.map((item, index) => (
        <div
          key={`${item.url}-${index}`}
          className={cn(
            "mb-4 break-inside-avoid",
            data.gap === "sm" && "mb-3",
            data.gap === "lg" && "mb-6"
          )}
        >
          <GalleryTile data={{ ...data, aspectRatio: "auto" }} item={item} />
        </div>
      ))}
    </div>
  );
}

function FeaturedGallery({
  data,
  items,
}: {
  data: GalleryData;
  items: GalleryItem[];
}) {
  const featuredIndex = Math.max(
    0,
    items.findIndex((item) => item.featured)
  );
  const featured = items[featuredIndex] ?? items[0];
  const rest = items.filter((_, index) => index !== featuredIndex);

  return (
    <div className={cn("mt-10 grid lg:grid-cols-[1.35fr_1fr]", GAPS[data.gap])}>
      <GalleryTile
        data={{ ...data, aspectRatio: data.aspectRatio === "auto" ? "video" : data.aspectRatio }}
        item={featured}
        priority
      />
      <div className={cn("grid sm:grid-cols-2", GAPS[data.gap])}>
        {rest.map((item, index) => (
          <GalleryTile
            key={`${item.url}-${index}`}
            data={{ ...data, aspectRatio: "square" }}
            item={item}
          />
        ))}
      </div>
    </div>
  );
}

function StripGallery({
  data,
  items,
}: {
  data: GalleryData;
  items: GalleryItem[];
}) {
  return (
    <div
      className={cn(
        "mt-10 flex snap-x gap-4 overflow-x-auto pb-3",
        data.gap === "sm" && "gap-3",
        data.gap === "lg" && "gap-6"
      )}
    >
      {items.map((item, index) => (
        <div
          key={`${item.url}-${index}`}
          className="w-[78%] shrink-0 snap-start sm:w-[44%] lg:w-[31%]"
        >
          <GalleryTile data={data} item={item} />
        </div>
      ))}
    </div>
  );
}

function GalleryTile({
  data,
  item,
  priority = false,
}: {
  data: GalleryData;
  item: GalleryItem;
  priority?: boolean;
}) {
  const captionPosition = data.captionPosition ?? "overlay";
  const hasCaption = Boolean(item.title || item.caption);
  const image = (
    <figure
      className={cn(
        "group relative h-full overflow-hidden bg-zinc-100",
        frameClass(data.frame),
        data.hoverEffect === "lift" &&
          "transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-zinc-200/70"
      )}
    >
      <BlockImage
        sizes={"(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"}
        src={item.url}
        alt={item.alt}
        className={cn(
          "w-full bg-zinc-100",
          ASPECTS[data.aspectRatio],
          data.aspectRatio === "auto" ? "h-auto" : "h-full object-cover",
          data.hoverEffect === "zoom" &&
            "transition duration-500 group-hover:scale-[1.04]"
        )}
        priority={priority}
      />
      {hasCaption && captionPosition === "overlay" ? (
        <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950/80 via-zinc-950/35 to-transparent px-4 pb-4 pt-14 text-white">
          {item.title ? (
            <p className="text-sm font-semibold leading-tight">{item.title}</p>
          ) : null}
          {item.caption ? (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/80">
              {item.caption}
            </p>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  );

  return (
    <div className="h-full">
      {data.lightbox && item.url ? (
        <Lightbox src={item.url} alt={item.alt} className="h-full">
          {image}
        </Lightbox>
      ) : item.href ? (
        <a href={item.href} className="block h-full">
          {image}
        </a>
      ) : (
        image
      )}
      {hasCaption && captionPosition === "below" ? (
        <div className="mt-3">
          {item.title ? (
            <p className="text-sm font-semibold text-zinc-900">{item.title}</p>
          ) : null}
          {item.caption ? (
            <p className="mt-1 text-sm leading-relaxed text-zinc-500">
              {item.caption}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function frameClass(frame: GalleryData["frame"]) {
  if (frame === "none") return "rounded-none";
  if (frame === "border") return "rounded-2xl border border-zinc-200 p-1";
  if (frame === "shadow") return "rounded-2xl shadow-xl shadow-zinc-200/70";
  return "rounded-2xl";
}
