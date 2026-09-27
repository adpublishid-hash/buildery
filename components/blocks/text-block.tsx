import type { TextData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";
import { RichHtml } from "./rich-html";
import { BlockImage } from "@/components/blocks/block-image";

export function TextBlock({ data }: { data: TextData }) {
  const layout = data.layout ?? "narrow";
  const tone = data.tone ?? "plain";
  const centered = data.align === "center";
  const content = data.body.includes("<") ? data.body : `<p>${data.body}</p>`;
  const imagePosition = data.imagePosition ?? "none";
  const hasImage = Boolean(data.imageUrl) && imagePosition !== "none";
  const inlineImage = hasImage ? (
    <BlockImage
      sizes={"(min-width: 768px) 768px, 100vw"}
      src={data.imageUrl}
      alt={data.imageAlt || data.heading || ""}
      className={cn(
        "rounded-xl object-cover",
        imagePosition === "top"
          ? "mb-5 w-full"
          : "w-full shrink-0 sm:w-2/5"
      )}
    />
  ) : null;

  return (
    <section className="px-6 py-12 md:px-10">
      <div
        className={cn(
          "mx-auto",
          layout === "narrow" && "max-w-2xl",
          layout === "wide" && "max-w-4xl",
          layout === "split" && "grid max-w-5xl gap-8 md:grid-cols-[0.85fr_1.15fr]",
          (layout === "callout" || layout === "quote") && "max-w-3xl",
          centered && layout !== "split" && "text-center"
        )}
      >
        <div
          className={cn(
            layout === "split" && "min-w-0",
            layout === "split" && centered && "md:text-left"
          )}
        >
          {data.eyebrow ? (
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
              {data.eyebrow}
            </p>
          ) : null}
          {data.heading ? (
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
              {data.heading}
            </h2>
          ) : null}
          {data.subheading ? (
            <p className="mt-3 text-base leading-relaxed text-zinc-500">
              {data.subheading}
            </p>
          ) : null}
        </div>

        <div
          className={cn(
            "min-w-0",
            layout !== "split" && (data.heading || data.subheading || data.eyebrow) && "mt-5",
            (imagePosition === "left" || imagePosition === "right") &&
              "flex flex-col gap-5 sm:flex-row sm:items-start",
            imagePosition === "right" && "sm:flex-row-reverse",
            layout === "callout" &&
              "rounded-2xl border border-zinc-200 bg-zinc-50 p-6 md:p-8",
            layout === "quote" &&
              "rounded-2xl border-l-4 border-zinc-950 bg-zinc-50 p-6 md:p-8",
            tone === "soft" && layout !== "callout" && layout !== "quote" &&
              "rounded-2xl bg-zinc-50 p-6 md:p-8",
            tone === "bordered" && layout !== "callout" && layout !== "quote" &&
              "rounded-2xl border border-zinc-200 p-6 md:p-8",
            tone === "accent" &&
              "rounded-2xl border border-zinc-950 bg-zinc-950 p-6 text-white md:p-8"
          )}
        >
          {imagePosition === "left" || imagePosition === "right" ? inlineImage : null}
          <div className="min-w-0 flex-1">
            {imagePosition === "top" ? inlineImage : null}
            {layout === "quote" ? (
              <span className="mb-4 block text-5xl font-semibold leading-none text-zinc-300">
                “
              </span>
            ) : null}
            <div
              className={cn(
                "text-base leading-relaxed",
                tone === "accent" ? "text-zinc-100" : "text-zinc-600",
                layout === "quote" && "text-lg"
              )}
            >
              <RichHtml html={content} />
            </div>
            {data.attribution ? (
              <p
                className={cn(
                  "mt-5 text-sm font-medium",
                  tone === "accent" ? "text-white" : "text-zinc-900"
                )}
              >
                {data.attribution}
              </p>
            ) : null}
            {data.buttonLabel ? (
              <a
                href={data.buttonHref || "#"}
                className={cn(
                  "mt-6 inline-flex rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-90",
                  tone === "accent"
                    ? "bg-white text-zinc-950"
                    : "text-white"
                )}
                style={
                  tone === "accent"
                    ? undefined
                    : { backgroundColor: "var(--bd-accent, #18181b)" }
                }
              >
                {data.buttonLabel}
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
