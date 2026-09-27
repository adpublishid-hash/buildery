import { Clock, MapPin, Navigation, Phone } from "lucide-react";

import type { MapData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";

const HEIGHTS: Record<MapData["height"], string> = {
  sm: "h-64",
  md: "h-80",
  lg: "h-[28rem]",
};

/** Titik peta: koordinat/alamat khusus bila diisi, selain itu alamatnya. */
function mapQuery(data: MapData): string {
  return (data.query?.trim() || data.address?.trim() || "").slice(0, 300);
}

/**
 * Peta lokasi untuk bisnis dengan toko fisik — warung, salon, klinik, kursus.
 *
 * Memakai embed Google Maps berbasis kueri, jadi tidak butuh API key. Iframe
 * dimuat malas: peta biasanya ada di bagian bawah halaman, dan memuatnya di
 * awal hanya memperlambat bagian yang sedang dilihat pengunjung.
 */
export function MapBlock({ data }: { data: MapData }) {
  const query = mapQuery(data);
  const centered = (data.align ?? "left") === "center";
  const split = data.layout === "split";
  const embed = query
    ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=${data.zoom ?? 15}&output=embed`
    : null;
  const directions = query
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`
    : null;
  const phoneHref = data.phone?.trim()
    ? `tel:${data.phone.replace(/[^\d+]/g, "")}`
    : null;

  const details = (
    <div className={cn("space-y-4", centered && !split && "text-center")}>
      {data.eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--bd-accent)]">
          {data.eyebrow}
        </p>
      ) : null}
      {data.heading ? (
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
          {data.heading}
        </h2>
      ) : null}
      {data.description ? (
        <p className="text-sm leading-6 text-zinc-600">{data.description}</p>
      ) : null}

      <dl className={cn("space-y-2.5 text-sm", centered && !split && "inline-block text-left")}>
        {data.address ? (
          <div className="flex gap-2.5">
            <dt className="sr-only">Alamat</dt>
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
            <dd className="whitespace-pre-line text-zinc-700">{data.address}</dd>
          </div>
        ) : null}
        {data.openingHours ? (
          <div className="flex gap-2.5">
            <dt className="sr-only">Jam buka</dt>
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
            <dd className="whitespace-pre-line text-zinc-700">{data.openingHours}</dd>
          </div>
        ) : null}
        {phoneHref ? (
          <div className="flex gap-2.5">
            <dt className="sr-only">Telepon</dt>
            <Phone className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
            <dd>
              <a href={phoneHref} className="text-zinc-700 underline-offset-4 hover:underline">
                {data.phone}
              </a>
            </dd>
          </div>
        ) : null}
      </dl>

      {data.showDirections && directions ? (
        <a
          href={directions}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-[var(--bd-radius,8px)] bg-[var(--bd-accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          <Navigation className="h-4 w-4" aria-hidden="true" />
          {data.directionsLabel || "Petunjuk arah"}
        </a>
      ) : null}
    </div>
  );

  const map = embed ? (
    <iframe
      src={embed}
      title={data.heading ? `Peta: ${data.heading}` : "Peta lokasi"}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      className={cn(
        "w-full rounded-[var(--bd-radius,8px)] border border-zinc-200",
        HEIGHTS[data.height ?? "md"]
      )}
    />
  ) : (
    <div
      className={cn(
        "flex w-full items-center justify-center rounded-[var(--bd-radius,8px)] border border-dashed border-zinc-300 text-sm text-zinc-500",
        HEIGHTS[data.height ?? "md"]
      )}
    >
      Isi alamat untuk menampilkan peta.
    </div>
  );

  return (
    <section className="px-6 py-[var(--bd-section-space,4rem)]">
      <div
        className={cn(
          "mx-auto max-w-[var(--bd-container,72rem)]",
          split ? "grid items-center gap-8 lg:grid-cols-[1fr_1.4fr]" : "space-y-8"
        )}
      >
        {details}
        {map}
      </div>
    </section>
  );
}
