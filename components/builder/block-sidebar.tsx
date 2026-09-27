"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { BLOCK_LIST } from "@/lib/blocks/registry";
import type { BlockType } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";

type BlockCategory = {
  id: string;
  label: string;
  description: string;
  types: BlockType[];
};

const BLOCK_CATEGORIES: BlockCategory[] = [
  {
    id: "core",
    label: "Dasar",
    description: "Struktur utama halaman.",
    types: ["HERO", "TEXT", "CUSTOM_HTML", "IMAGE", "CTA", "BUTTON", "DIVIDER"],
  },
  {
    id: "navigation",
    label: "Navigasi",
    description: "Header, menu halaman, dan footer.",
    types: ["HEADER", "MENU", "FOOTER"],
  },
  {
    id: "profile",
    label: "Profil",
    description: "Tampilkan identitas, bio, dan link tree.",
    types: ["BIO_PROFILE"],
  },
  {
    id: "layout",
    label: "Layout",
    description: "Susun konten, fitur, angka, dan harga.",
    types: ["COLUMNS", "FEATURE_GRID", "STATS", "STEPS", "PRICING"],
  },
  {
    id: "media",
    label: "Media & trust",
    description: "Visual, video, logo, FAQ, dan testimoni.",
    types: ["TESTIMONIAL", "LOGOS", "GALLERY", "IMAGE_SLIDER", "VIDEO", "FAQ"],
  },
  {
    id: "forms",
    label: "Form & pesan",
    description: "Capture lead dan komunikasi.",
    types: ["FORM_EMBED", "NEWSLETTER", "BANNER", "CONTACT_FORM"],
  },
  {
    id: "engagement",
    label: "Engagement",
    description: "Urgency, perbandingan, dan teks berjalan.",
    types: ["COUNTDOWN", "COMPARISON_TABLE", "MARQUEE"],
  },
  {
    id: "commerce",
    label: "Bisnis",
    description: "Produk, kursus, blog, membership, afiliasi.",
    types: [
      "PRODUCT_SHOWCASE",
      "COURSE_SHOWCASE",
      "BLOG_SHOWCASE",
      "MEMBERSHIP_SHOWCASE",
      "AFFILIATE_CTA",
    ],
  },
];

const CATEGORY_BY_TYPE = new Map(
  BLOCK_CATEGORIES.flatMap((category) =>
    category.types.map((type) => [type, category] as const)
  )
);

export function BlockSidebar({
  onAdd,
}: {
  onAdd: (type: BlockType) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const normalizedQuery = query.trim().toLowerCase();

  const visibleGroups = useMemo(() => {
    const activeTypes =
      activeCategory === "all"
        ? null
        : new Set(
            BLOCK_CATEGORIES.find((category) => category.id === activeCategory)
              ?.types ?? []
          );

    return BLOCK_CATEGORIES.map((category) => {
      const blocks = category.types
        .map((type) => BLOCK_LIST.find((meta) => meta.type === type))
        .filter((meta): meta is (typeof BLOCK_LIST)[number] => Boolean(meta))
        .filter((meta) => {
          if (activeTypes && !activeTypes.has(meta.type)) return false;
          if (!normalizedQuery) return true;

          const haystack = [
            meta.label,
            meta.description,
            meta.type,
            category.label,
            category.description,
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(normalizedQuery);
        });

      return { ...category, blocks };
    }).filter((category) => category.blocks.length > 0);
  }, [activeCategory, normalizedQuery]);

  const resultCount = visibleGroups.reduce(
    (total, category) => total + category.blocks.length,
    0
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-200/70 px-4 py-3 dark:border-zinc-800">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Blocks
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Click a block to add it to the page.
        </p>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari block..."
            className="h-9 w-full rounded-lg border border-zinc-200 bg-white pl-8 pr-8 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-300 focus:ring-2 focus:ring-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-700 dark:focus:ring-zinc-900"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              aria-label="Clear block search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <div className="-mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-1">
          <CategoryButton
            active={activeCategory === "all"}
            onClick={() => setActiveCategory("all")}
          >
            Semua
          </CategoryButton>
          {BLOCK_CATEGORIES.map((category) => (
            <CategoryButton
              key={category.id}
              active={activeCategory === category.id}
              onClick={() => setActiveCategory(category.id)}
            >
              {category.label}
            </CategoryButton>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-zinc-400">
          {resultCount} block tersedia
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {visibleGroups.length > 0 ? (
          <div className="space-y-5">
            {visibleGroups.map((category) => (
              <section key={category.id}>
                <div className="mb-2 flex items-end justify-between gap-3 px-1">
                  <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {category.label}
                    </h3>
                    <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">
                      {category.description}
                    </p>
                  </div>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                    {category.blocks.length}
                  </span>
                </div>
                <div className="space-y-1">
                  {category.blocks.map((meta) => {
                    const Icon = meta.icon;
                    const categoryMeta = CATEGORY_BY_TYPE.get(meta.type);
                    return (
                      <button
                        key={meta.type}
                        type="button"
                        onClick={() => onAdd(meta.type)}
                        className="group flex w-full items-start gap-3 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:border-zinc-200 hover:bg-zinc-50 dark:hover:border-zinc-800 dark:hover:bg-zinc-900"
                      >
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition group-hover:border-zinc-300 group-hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:group-hover:text-zinc-50">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">
                              {meta.label}
                            </span>
                            {activeCategory === "all" && categoryMeta ? (
                              <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 dark:bg-zinc-900">
                                {categoryMeta.label}
                              </span>
                            ) : null}
                          </span>
                          <span className="block text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                            {meta.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center">
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                Block tidak ditemukan
              </p>
              <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                Coba kata kunci lain atau pilih kategori Semua.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setActiveCategory("all");
                }}
                className="mt-3 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Reset filter
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-7 shrink-0 rounded-full border px-3 text-xs font-medium transition",
        active
          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
      )}
    >
      {children}
    </button>
  );
}
