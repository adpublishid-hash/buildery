"use client";

import { useEffect, useMemo, useState } from "react";
import { Package, ZoomIn } from "lucide-react";

import { cn } from "@/lib/utils";
import { StoreImage } from "@/components/store/store-image";
import { useVariantSelection } from "@/components/store/variant-selection";

type Image = { id: string; url: string };

export function ProductGallery({
  images,
  alt,
}: {
  images: Image[];
  alt: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  const { selectedImageUrl } = useVariantSelection();

  // A variant photo the seller did not also add to the gallery still needs a
  // slot, so it goes in front rather than being dropped.
  const shownImages = useMemo(() => {
    if (!selectedImageUrl) return images;
    if (images.some((image) => image.url === selectedImageUrl)) return images;
    return [{ id: "variant", url: selectedImageUrl }, ...images];
  }, [images, selectedImageUrl]);

  // Follow the buyer's choice: picking "Merah" should show the red one.
  useEffect(() => {
    if (!selectedImageUrl) return;
    const index = shownImages.findIndex(
      (image) => image.url === selectedImageUrl
    );
    if (index >= 0) setActiveIndex(index);
  }, [selectedImageUrl, shownImages]);

  // Lock the body scroll while the zoom overlay is open.
  useEffect(() => {
    if (!zoom) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [zoom]);

  if (shownImages.length === 0) {
    return (
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
        <div className="flex aspect-square w-full items-center justify-center">
          <Package className="h-10 w-10 text-zinc-300" />
        </div>
      </div>
    );
  }

  const active = shownImages[Math.min(activeIndex, shownImages.length - 1)];

  return (
    <div>
      <div className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
        <div
          className="relative aspect-square w-full cursor-zoom-in"
          onClick={() => setZoom(true)}
        >
          <StoreImage
            src={active.url}
            alt={alt}
            sizes="(max-width: 1024px) 100vw, 520px"
            // The product photo is what the page is judged on; load it first.
            priority
            className="transition-transform duration-500 group-hover:scale-[1.02]"
          />
        </div>
        <button
          type="button"
          onClick={() => setZoom(true)}
          aria-label="Perbesar gambar"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-zinc-700 shadow-sm backdrop-blur transition hover:bg-white"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>

      {shownImages.length > 1 ? (
        <div className="mt-3 grid grid-cols-5 gap-2">
          {shownImages.slice(0, 10).map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`Lihat gambar ${index + 1}`}
              className={cn(
                "overflow-hidden rounded-lg border bg-zinc-50 transition",
                index === activeIndex
                  ? "border-zinc-900 ring-2 ring-zinc-900/10"
                  : "border-zinc-200 hover:border-zinc-300"
              )}
            >
              <div className="relative aspect-square w-full">
                <StoreImage src={image.url} alt="" sizes="96px" />
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {zoom ? (
        <div
          onClick={() => setZoom(false)}
          className="fixed inset-0 z-[80] flex cursor-zoom-out items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={active.url}
            alt={alt}
            className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      ) : null}
    </div>
  );
}
