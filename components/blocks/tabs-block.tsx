"use client";

import Link from "next/link";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import type { TabsData } from "@/lib/blocks/schema";
import { BlockImage } from "@/components/blocks/block-image";
import { cn } from "@/lib/utils";

/**
 * Konten bertab — misalnya paket untuk segmen berbeda, atau menu per
 * kategori — supaya satu section tidak memanjang ke bawah.
 *
 * Mengikuti pola tab WAI-ARIA: tablist/tab/tabpanel, tab aktif satu-satunya
 * yang bisa difokus lewat Tab, dan panah kiri/kanan/Home/End berpindah tab.
 * Panel yang tidak aktif disembunyikan dengan atribut `hidden`, jadi isinya
 * tetap ada di HTML dan tetap bisa dirayapi mesin pencari.
 */
export function TabsBlock({ data }: { data: TabsData }) {
  const tabs = data.tabs ?? [];
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  const centered = (data.align ?? "center") === "center";
  const variant = data.variant ?? "pills";

  if (tabs.length === 0) return null;
  const current = Math.min(active, tabs.length - 1);

  function focusTab(index: number) {
    const next = (index + tabs.length) % tabs.length;
    setActive(next);
    refs.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowRight") focusTab(index + 1);
    else if (event.key === "ArrowLeft") focusTab(index - 1);
    else if (event.key === "Home") focusTab(0);
    else if (event.key === "End") focusTab(tabs.length - 1);
    else return;
    event.preventDefault();
  }

  return (
    <section className="px-6 py-[var(--bd-section-space,4rem)]">
      <div className="mx-auto max-w-[var(--bd-container,72rem)]">
        {(data.eyebrow || data.heading || data.subheading) && (
          <div className={cn("mb-8 max-w-2xl", centered && "mx-auto text-center")}>
            {data.eyebrow ? (
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--bd-accent)]">
                {data.eyebrow}
              </p>
            ) : null}
            {data.heading ? (
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
                {data.heading}
              </h2>
            ) : null}
            {data.subheading ? (
              <p className="mt-3 text-sm leading-6 text-zinc-600">{data.subheading}</p>
            ) : null}
          </div>
        )}

        <div
          role="tablist"
          aria-label={data.heading || "Pilihan"}
          className={cn(
            "flex flex-wrap gap-2",
            centered && "justify-center",
            variant === "underline" && "gap-6 border-b border-zinc-200",
            variant === "boxed" && "gap-0 rounded-[var(--bd-radius,8px)] border border-zinc-200 bg-zinc-50 p-1"
          )}
        >
          {tabs.map((tab, index) => {
            const selected = index === current;
            return (
              <button
                key={index}
                ref={(node) => {
                  refs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${index}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${index}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(index)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={cn(
                  "text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bd-accent)]",
                  variant === "pills" &&
                    (selected
                      ? "rounded-full bg-[var(--bd-accent)] px-4 py-2 text-white"
                      : "rounded-full bg-zinc-100 px-4 py-2 text-zinc-700 hover:bg-zinc-200"),
                  variant === "underline" &&
                    cn(
                      "-mb-px border-b-2 px-1 pb-3",
                      selected
                        ? "border-[var(--bd-accent)] text-zinc-950"
                        : "border-transparent text-zinc-500 hover:text-zinc-800"
                    ),
                  variant === "boxed" &&
                    (selected
                      ? "flex-1 rounded-[calc(var(--bd-radius,8px)-2px)] bg-white px-4 py-2 text-zinc-950 shadow-sm"
                      : "flex-1 px-4 py-2 text-zinc-600 hover:text-zinc-900")
                )}
              >
                {tab.label || `Tab ${index + 1}`}
              </button>
            );
          })}
        </div>

        {tabs.map((tab, index) => (
          <div
            key={index}
            role="tabpanel"
            id={`${baseId}-panel-${index}`}
            aria-labelledby={`${baseId}-tab-${index}`}
            hidden={index !== current}
            tabIndex={0}
            className="mt-8 focus-visible:outline-none"
          >
            <div
              className={cn(
                "grid items-center gap-8",
                tab.imageUrl && "lg:grid-cols-2"
              )}
            >
              <div className={cn(!tab.imageUrl && centered && "mx-auto max-w-2xl text-center")}>
                {tab.heading ? (
                  <h3 className="text-xl font-semibold tracking-tight text-zinc-950">
                    {tab.heading}
                  </h3>
                ) : null}
                {tab.body ? (
                  <p className="mt-3 whitespace-pre-line text-sm leading-7 text-zinc-600">
                    {tab.body}
                  </p>
                ) : null}
                {tab.ctaLabel ? (
                  <Link
                    href={tab.ctaHref || "#"}
                    className="mt-5 inline-flex items-center rounded-[var(--bd-radius,8px)] bg-[var(--bd-accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                  >
                    {tab.ctaLabel}
                  </Link>
                ) : null}
              </div>
              {tab.imageUrl ? (
                <BlockImage
                  src={tab.imageUrl}
                  alt={tab.imageAlt || tab.heading || tab.label}
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="aspect-[4/3] w-full rounded-[var(--bd-radius,8px)] object-cover"
                />
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
