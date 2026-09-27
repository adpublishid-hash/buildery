import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * A storefront image that gets optimised when it safely can.
 *
 * Every image on the shop was a raw <img>: no WebP/AVIF, no srcset, no
 * intrinsic size — and on a catalogue page the photos are what decide LCP.
 *
 * Uploaded images are same-origin and go through Next's optimiser. A URL the
 * merchant pasted from somewhere else cannot: the optimiser only accepts hosts
 * listed in next.config, and allowing arbitrary ones turns it into an open
 * image proxy. Those still get lazy loading and async decoding.
 */
export function StoreImage({
  src,
  alt,
  sizes,
  className,
  priority,
}: {
  src: string;
  alt: string;
  /** Required by the optimiser to pick a width; the layout is always `fill`. */
  sizes: string;
  className?: string;
  /** Set on the one image above the fold, never on a grid of them. */
  priority?: boolean;
}) {
  const optimizable = src.startsWith("/") && !src.startsWith("//");

  if (!optimizable) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className={cn("h-full w-full object-cover", className)}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={cn("object-cover", className)}
    />
  );
}
