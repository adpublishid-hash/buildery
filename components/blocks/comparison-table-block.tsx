import Link from "next/link";
import { ArrowRight, Check, Minus } from "lucide-react";

import type { ComparisonTableData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";

/** Renders ✓ and — as icons; passes through any other string verbatim. */
function CellValue({
  value,
  highlighted,
}: {
  value: string;
  highlighted: boolean;
}) {
  const trimmed = value.trim();
  if (trimmed === "✓" || trimmed.toLowerCase() === "yes" || trimmed === "true") {
    return (
      <Check
        className={cn(
          "h-4 w-4",
          highlighted ? "text-white" : "text-emerald-600"
        )}
        aria-label="Tersedia"
      />
    );
  }
  if (
    trimmed === "—" ||
    trimmed === "-" ||
    trimmed === "" ||
    trimmed.toLowerCase() === "no" ||
    trimmed.toLowerCase() === "false"
  ) {
    return (
      <Minus
        className={cn(
          "h-4 w-4",
          highlighted ? "text-white/60" : "text-zinc-300"
        )}
        aria-label="Tidak tersedia"
      />
    );
  }
  return (
    <span
      className={cn(
        "text-sm font-medium",
        highlighted ? "text-white" : "text-zinc-700"
      )}
    >
      {trimmed}
    </span>
  );
}

export function ComparisonTableBlock({
  data,
}: {
  data: ComparisonTableData;
}) {
  const layout = data.layout ?? "table";
  const tone = data.tone ?? "light";
  const centered = (data.align ?? "center") === "center";
  const columns = data.columns ?? [];
  const rows = data.rows ?? [];

  if (columns.length === 0) {
    return (
      <section className="px-6 py-12 md:px-10">
        <div className="mx-auto flex max-w-4xl items-center justify-center rounded-2xl border border-dashed border-zinc-300 p-8 text-sm text-zinc-400">
          Tambahkan kolom paket untuk menampilkan tabel perbandingan.
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 py-16 sm:px-6 md:px-10 md:py-24">
      <div className="mx-auto max-w-6xl">
        {data.eyebrow || data.heading || data.subheading ? (
          <div className={cn("mb-10 max-w-3xl md:mb-12", centered && "mx-auto text-center")}>
            {data.eyebrow ? (
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                {data.eyebrow}
              </p>
            ) : null}
            {data.heading ? (
              <h2 className="text-3xl font-semibold leading-tight tracking-tight text-zinc-950 md:text-4xl">
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

        {layout === "cards" ? (
          <div
            className={cn(
              "grid gap-5",
              columns.length === 2
                ? "md:grid-cols-2"
                : columns.length >= 4
                  ? "sm:grid-cols-2 lg:grid-cols-4"
                  : "sm:grid-cols-2 lg:grid-cols-3"
            )}
          >
            {columns.map((col, ci) => (
              <div
                key={ci}
                className={cn(
                  "flex min-w-0 flex-col rounded-3xl border p-6 transition duration-200 hover:-translate-y-1 hover:shadow-xl md:p-7",
                  col.highlighted
                    ? "border-zinc-950 bg-zinc-950 text-white shadow-xl shadow-zinc-900/15 ring-4 ring-zinc-950/5"
                    : tone === "soft"
                      ? "border-zinc-100 bg-zinc-50"
                      : "border-zinc-200 bg-white"
                )}
              >
                {col.badge ? (
                  <span
                    className={cn(
                      "mb-3 inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
                      col.highlighted
                        ? "bg-white/15 text-white"
                        : "bg-zinc-900 text-white"
                    )}
                  >
                    {col.badge}
                  </span>
                ) : null}
                <h3
                  className={cn(
                    "text-lg font-semibold",
                    col.highlighted ? "text-white" : "text-zinc-900"
                  )}
                >
                  {col.name}
                </h3>
                {col.description ? (
                  <p
                    className={cn(
                      "mt-1 text-sm leading-relaxed",
                      col.highlighted ? "text-zinc-200" : "text-zinc-500"
                    )}
                  >
                    {col.description}
                  </p>
                ) : null}

                <ul className="mt-5 space-y-2.5 text-sm">
                  {rows.map((row, ri) => {
                    const value = row.values?.[ci] ?? "";
                    return (
                      <li key={ri} className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                          <CellValue value={value} highlighted={col.highlighted} />
                        </span>
                        <span
                          className={cn(
                            "leading-snug",
                            col.highlighted ? "text-zinc-100" : "text-zinc-700"
                          )}
                        >
                          {row.feature}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {data.showCta && col.ctaLabel ? (
                  <Link
                    href={col.ctaHref || "#"}
                    className={cn(
                      "mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition hover:opacity-90",
                      col.highlighted
                        ? "bg-white text-zinc-950"
                        : "text-white"
                    )}
                    style={
                      col.highlighted
                        ? undefined
                        : { backgroundColor: "var(--bd-accent, #18181b)" }
                    }
                  >
                    {col.ctaLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="space-y-4 md:hidden">
              {rows.map((row, ri) => (
                <article
                  key={ri}
                  className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
                >
                  <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3.5">
                    <h3 className="text-sm font-semibold text-zinc-950">
                      {row.feature}
                    </h3>
                    {row.description ? (
                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        {row.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid gap-2 p-2">
                    {columns.map((col, ci) => (
                      <div
                        key={ci}
                        className={cn(
                          "flex items-center justify-between gap-4 rounded-xl px-3.5 py-3",
                          col.highlighted
                            ? "bg-zinc-950 text-white"
                            : "bg-zinc-50 text-zinc-900"
                        )}
                      >
                        <span className={cn("text-xs font-medium", col.highlighted ? "text-zinc-300" : "text-zinc-500")}>
                          {col.name}
                        </span>
                        <CellValue
                          value={row.values?.[ci] ?? ""}
                          highlighted={col.highlighted}
                        />
                      </div>
                    ))}
                  </div>
                </article>
              ))}
              {data.showCta
                ? columns.map((col, ci) =>
                    col.ctaLabel ? (
                      <Link
                        key={ci}
                        href={col.ctaHref || "#"}
                        className={cn(
                          "flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition hover:opacity-90",
                          col.highlighted
                            ? "bg-zinc-950 text-white"
                            : "text-white"
                        )}
                        style={
                          col.highlighted
                            ? undefined
                            : { backgroundColor: "var(--bd-accent, #18181b)" }
                        }
                      >
                        {col.ctaLabel}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    ) : null
                  )
                : null}
            </div>

            <div className="hidden overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm md:block">
            <table className="w-full table-fixed border-separate border-spacing-0 text-left">
              <thead>
                <tr>
                  <th className="w-[34%] border-b border-zinc-200 bg-zinc-50 px-6 py-5 align-bottom text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Fitur
                  </th>
                  {columns.map((col, ci) => (
                    <th
                      key={ci}
                      className={cn(
                        "border-b border-l border-zinc-200 bg-zinc-50 px-5 py-5 align-bottom",
                        col.highlighted && "border-zinc-800 bg-zinc-950 text-white"
                      )}
                    >
                      <div className="flex flex-col gap-1">
                        {col.badge ? (
                          <span
                            className={cn(
                              "inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
                              col.highlighted
                                ? "bg-white/15 text-white"
                                : "bg-zinc-100 text-zinc-700"
                            )}
                          >
                            {col.badge}
                          </span>
                        ) : null}
                        <span
                          className={cn(
                            "text-base font-semibold",
                            col.highlighted ? "text-white" : "text-zinc-900"
                          )}
                        >
                          {col.name}
                        </span>
                        {col.description ? (
                          <span
                            className={cn(
                              "text-xs font-normal leading-snug",
                              col.highlighted ? "text-zinc-200" : "text-zinc-500"
                            )}
                          >
                            {col.description}
                          </span>
                        ) : null}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri}>
                    <td className="border-b border-zinc-200 bg-white px-6 py-4 align-middle">
                      <div className="text-sm font-medium text-zinc-900">
                        {row.feature}
                      </div>
                      {row.description ? (
                        <div className="mt-0.5 text-xs leading-snug text-zinc-500">
                          {row.description}
                        </div>
                      ) : null}
                    </td>
                    {columns.map((col, ci) => {
                      const value = row.values?.[ci] ?? "";
                      return (
                        <td
                          key={ci}
                          className={cn(
                            "border-b border-l border-zinc-200 px-5 py-4 align-middle",
                            col.highlighted && "border-zinc-800 bg-zinc-950"
                          )}
                        >
                          <CellValue value={value} highlighted={col.highlighted} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {data.showCta &&
                columns.some((col) => col.ctaLabel) ? (
                  <tr>
                    <td className="bg-zinc-50 px-6 py-5" />
                    {columns.map((col, ci) => (
                      <td
                        key={ci}
                        className={cn(
                          "border-l border-zinc-200 bg-zinc-50 px-5 py-5",
                          col.highlighted && "border-zinc-800 bg-zinc-950"
                        )}
                      >
                        {col.ctaLabel ? (
                          <Link
                            href={col.ctaHref || "#"}
                            className={cn(
                              "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition hover:opacity-90",
                              col.highlighted
                                ? "bg-white text-zinc-950"
                                : "text-white"
                            )}
                            style={
                              col.highlighted
                                ? undefined
                                : { backgroundColor: "var(--bd-accent, #18181b)" }
                            }
                          >
                            {col.ctaLabel}
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        ) : null}
                      </td>
                    ))}
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </section>
  );
}
