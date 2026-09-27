import Link from "next/link";

import type { CollectionData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";
import { BlockImage } from "@/components/blocks/block-image";

type Props = {
  data: CollectionData;
  kind: "products" | "courses" | "blog" | "memberships";
};

const KIND_LABEL = {
  products: "Produk",
  courses: "Kursus",
  blog: "Blog",
  memberships: "Membership",
};

export function CollectionBlock({ data, kind }: Props) {
  const grid =
    data.columns === 4
      ? "md:grid-cols-4"
      : data.columns === 2
        ? "md:grid-cols-2"
        : "md:grid-cols-3";

  return (
    <section className="px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              {KIND_LABEL[kind]}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
              {data.heading}
            </h2>
            {data.subheading ? (
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
                {data.subheading}
              </p>
            ) : null}
          </div>
          {data.buttonLabel ? (
            <Link
              href={data.buttonHref || "#"}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
            >
              {data.buttonLabel}
            </Link>
          ) : null}
        </div>

        <div className={cn("grid gap-4", grid)}>
          {data.items.map((item, index) => (
            <Link
              key={`${item.title}-${index}`}
              href={item.href || "#"}
              className="group overflow-hidden rounded-xl border border-zinc-200 bg-white transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm"
            >
              {item.imageUrl ? (
                <div className="aspect-[16/10] overflow-hidden bg-zinc-50">
                  <BlockImage
                    sizes={"(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"}
                    src={item.imageUrl}
                    alt=""
                    className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                  />
                </div>
              ) : null}
              <div className="p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  {item.badge ? (
                    <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-600">
                      {item.badge}
                    </span>
                  ) : (
                    <span />
                  )}
                  {item.meta ? (
                    <span className="text-xs font-medium text-zinc-500">
                      {item.meta}
                    </span>
                  ) : null}
                </div>
                <h3 className="text-base font-semibold text-zinc-950 group-hover:underline">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  {item.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
