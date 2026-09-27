import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = {
  /** Current 1-based page. */
  page: number;
  /** Total number of rows across all pages. */
  total: number;
  /** Rows per page. */
  pageSize: number;
  /** Path the page links point at, e.g. "/dashboard/orders". */
  basePath: string;
  /** Extra query params to preserve on the page links. */
  params?: Record<string, string | undefined>;
};

/** Server-rendered pager — links carry `?page=`, no client JS needed. */
export function Pagination({ page, total, pageSize, basePath, params }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v) sp.set(k, v);
    }
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-[12px] px-[12px] py-[10px]">
      <p className="kv-tabular text-[12px] text-kv-muted-fg">
        {from}–{to} of {total.toLocaleString()}
      </p>
      <div className="flex items-center gap-[6px]">
        <PagerLink
          href={href(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </PagerLink>
        <span className="kv-tabular px-[6px] text-[12px] text-kv-secondary-fg">
          Page {page} / {totalPages}
        </span>
        <PagerLink
          href={href(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </PagerLink>
      </div>
    </div>
  );
}

function PagerLink({
  href,
  disabled,
  children,
  ...rest
}: {
  href: string;
  disabled?: boolean;
  children: React.ReactNode;
} & React.AriaAttributes) {
  const className = cn(
    "flex h-[28px] w-[28px] items-center justify-center rounded-[8px] border-[0.8px] border-kv-input bg-kv-card text-kv-secondary-fg transition-[background-color,box-shadow,color] duration-150",
    disabled
      ? "pointer-events-none opacity-40"
      : "hover:bg-[#fcfcfc] hover:text-kv-fg hover:shadow-kv-hover"
  );
  if (disabled) {
    return (
      <span className={className} aria-disabled {...rest}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={className} {...rest}>
      {children}
    </Link>
  );
}

/** Parses a `?page=` search param into a safe 1-based integer. */
export function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
