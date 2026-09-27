import type { TestimonialData } from "@/lib/blocks/schema";
import { cn, getInitials } from "@/lib/utils";
import { BlockImage } from "@/components/blocks/block-image";

type TestimonialItem = TestimonialData["items"][number];

export function TestimonialBlock({ data }: { data: TestimonialData }) {
  const layout = data.layout ?? "single";
  const tone = data.tone ?? "light";
  const centered = (data.align ?? "center") === "center";
  const inverse = tone === "dark";
  const items =
    data.items.length > 0
      ? data.items
      : [
          {
            quote: data.quote,
            authorName: data.authorName,
            authorRole: data.authorRole,
            avatarUrl: data.avatarUrl,
            logoUrl: data.logoUrl ?? "",
            rating: data.rating ?? 5,
            highlighted: false,
          },
        ];

  return (
    <section className="px-6 py-16 md:px-10">
      <div className="mx-auto max-w-6xl">
        {data.eyebrow || data.heading || data.subheading ? (
          <div className={cn("mb-10 max-w-3xl", centered && "mx-auto text-center")}>
            {data.eyebrow ? (
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
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

        {layout === "scroll" ? (
          <div className="flex snap-x gap-5 overflow-x-auto pb-3">
            {items.map((item, index) => (
              <div
                key={index}
                className="w-[82%] shrink-0 snap-start sm:w-[48%] lg:w-[33%]"
              >
                <TestimonialCard
                  item={item}
                  inverse={inverse || item.highlighted}
                  showQuotes={data.showQuotes}
                  tone={tone}
                />
              </div>
            ))}
          </div>
        ) : layout === "grid" ? (
          <div
            className={cn(
              "grid gap-5",
              data.columns === 2 ? "md:grid-cols-2" : "md:grid-cols-3"
            )}
          >
            {items.map((item, index) => (
              <TestimonialCard
                key={index}
                item={item}
                inverse={inverse || item.highlighted}
                showQuotes={data.showQuotes}
                tone={tone}
              />
            ))}
          </div>
        ) : layout === "split" ? (
          <div
            className={cn(
              "grid items-center gap-8 rounded-2xl border p-6 md:grid-cols-[0.9fr_1.1fr] md:p-8",
              inverse ? "border-zinc-900 bg-zinc-950 text-white" : "border-zinc-200 bg-white"
            )}
          >
            <AuthorBlock item={items[0]} inverse={inverse} large />
            <QuoteBlock item={items[0]} inverse={inverse} showQuotes={data.showQuotes} large />
          </div>
        ) : (
          <figure
            className={cn(
              "mx-auto max-w-3xl",
              centered && "text-center",
              layout === "card" && "rounded-2xl border p-6 md:p-8",
              layout === "card" && tone === "soft" && "border-zinc-100 bg-zinc-50",
              layout === "card" && tone === "light" && "border-zinc-200 bg-white",
              inverse && "border-zinc-900 bg-zinc-950 text-white"
            )}
          >
            <QuoteBlock item={items[0]} inverse={inverse} showQuotes={data.showQuotes} large />
            <figcaption className={cn("mt-7 flex items-center gap-3", centered && "justify-center")}>
              <AuthorBlock item={items[0]} inverse={inverse} />
            </figcaption>
          </figure>
        )}
      </div>
    </section>
  );
}

function TestimonialCard({
  inverse,
  item,
  showQuotes,
  tone,
}: {
  inverse: boolean;
  item: TestimonialItem;
  showQuotes: boolean;
  tone: TestimonialData["tone"];
}) {
  return (
    <figure
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border p-6",
        tone === "soft" && !inverse && "border-zinc-100 bg-zinc-50",
        tone === "light" && !inverse && "border-zinc-200 bg-white",
        inverse && "border-zinc-950 bg-zinc-950 text-white shadow-xl shadow-zinc-900/15"
      )}
    >
      <QuoteBlock item={item} inverse={inverse} showQuotes={showQuotes} />
      <figcaption className="mt-6">
        <AuthorBlock item={item} inverse={inverse} />
      </figcaption>
    </figure>
  );
}

function QuoteBlock({
  inverse,
  item,
  large,
  showQuotes,
}: {
  inverse: boolean;
  item: TestimonialItem;
  large?: boolean;
  showQuotes: boolean;
}) {
  return (
    <div>
      {item.rating > 0 ? (
        <p className={cn("mb-4 text-sm tracking-wide", inverse ? "text-amber-200" : "text-amber-500")}>
          {"★".repeat(item.rating)}
        </p>
      ) : null}
      {showQuotes ? (
        <span className={cn("mb-3 block text-5xl font-semibold leading-none", inverse ? "text-white/20" : "text-zinc-200")}>
          “
        </span>
      ) : null}
      <blockquote
        className={cn(
          "font-medium leading-relaxed tracking-tight",
          large ? "text-2xl md:text-3xl" : "text-lg",
          inverse ? "text-white" : "text-zinc-900"
        )}
      >
        {item.quote}
      </blockquote>
    </div>
  );
}

function AuthorBlock({
  inverse,
  item,
  large,
}: {
  inverse: boolean;
  item: TestimonialItem;
  large?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold", large ? "h-14 w-14" : "h-10 w-10", inverse ? "bg-white/10 text-white" : "bg-zinc-900 text-white")}>
        {item.avatarUrl ? (
          <BlockImage
            sizes={"96px"}
            src={item.avatarUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          getInitials(item.authorName || "?")
        )}
      </span>
      <span className="min-w-0 text-left">
        <span className={cn("block text-sm font-semibold", inverse ? "text-white" : "text-zinc-900")}>
          {item.authorName}
        </span>
        <span className={cn("block text-sm", inverse ? "text-zinc-300" : "text-zinc-500")}>
          {item.authorRole}
        </span>
        {item.logoUrl ? (
          <BlockImage
            sizes={"96px"}
            src={item.logoUrl}
            alt=""
            className="mt-2 h-5 max-w-24 object-contain opacity-70"
          />
        ) : null}
      </span>
    </div>
  );
}
