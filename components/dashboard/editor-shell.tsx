import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * Shared frame for the create/edit screens (post, product, course, form,
 * membership, affiliate): one sticky header that carries the title, status and
 * every action, then the content column and a side column. Screens used to
 * stack a page header on top of a second action bar, each with its own width.
 */

export type EditorStatusTone = "draft" | "live" | "scheduled" | "archived";

const STATUS_DOT: Record<EditorStatusTone, string> = {
  draft: "bg-amber-500",
  live: "bg-kv-success",
  scheduled: "bg-sky-500",
  archived: "bg-kv-subtle",
};

export function EditorStatus({ tone, children }: { tone: EditorStatusTone; children: React.ReactNode }) {
  return (
    <span className="inline-flex h-[22px] shrink-0 items-center gap-[6px] rounded-[7px] border-[0.8px] border-kv-border bg-kv-card px-[7px] text-[11px] font-medium text-kv-secondary-fg">
      <span className={cn("h-[6px] w-[6px] rounded-full", STATUS_DOT[tone])} />
      {children}
    </span>
  );
}

export function EditorHeader({
  backHref,
  backLabel,
  eyebrow,
  title,
  status,
  meta,
  actions,
}: {
  backHref: string;
  backLabel: string;
  /** What is being edited ("Post baru", "Edit produk"). */
  eyebrow: string;
  title: React.ReactNode;
  status?: React.ReactNode;
  /** Save state, word count… one short line under the title. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    // Bleeds to the shell's edges (12px, 16px from sm) so the rule under it
    // spans the page while its content lines up with the column below.
    <div className="sticky top-0 z-20 -mx-[12px] mb-[12px] border-b-[0.8px] border-kv-border bg-kv-card/90 px-[12px] py-[10px] backdrop-blur sm:-mx-[16px] sm:px-[16px]">
      <div className="flex flex-wrap items-center justify-between gap-x-[16px] gap-y-[10px]">
        <div className="flex min-w-0 flex-1 items-center gap-[10px]">
          <Link
            href={backHref}
            aria-label={backLabel}
            title={backLabel}
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] border-[0.8px] border-kv-border text-kv-secondary-fg transition-colors hover:bg-kv-hover hover:text-kv-fg"
          >
            <ArrowLeft className="h-[15px] w-[15px]" />
          </Link>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.06em] text-kv-muted-fg">{eyebrow}</p>
            <div className="mt-[2px] flex min-w-0 items-center gap-[8px]">
              <h1 className="truncate text-[17px] font-semibold leading-tight tracking-[-0.01em] text-kv-fg">{title}</h1>
              {status}
            </div>
            {meta ? <p className="mt-[3px] truncate text-[12px] text-kv-muted-fg">{meta}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-[6px]">{actions}</div> : null}
      </div>
    </div>
  );
}

/**
 * Content column plus side column. The side column follows the page on wide
 * screens and scrolls on its own when it is taller than the window.
 */
export function EditorLayout({
  children,
  aside,
  asideWidth = "340px",
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
  asideWidth?: string;
}) {
  return (
    <div
      className="kv-editor grid min-w-0 grid-cols-1 gap-[12px] xl:grid-cols-[minmax(0,1fr)_var(--editor-aside)]"
      style={{ ["--editor-aside" as string]: asideWidth }}
    >
      <div className="flex min-w-0 flex-col gap-[12px]">{children}</div>
      {aside ? (
        <aside className="flex min-w-0 flex-col gap-[12px] xl:sticky xl:top-[84px] xl:max-h-[calc(100dvh-100px)] xl:self-start xl:overflow-y-auto xl:pb-[4px] [scrollbar-width:thin]">
          {aside}
        </aside>
      ) : null}
    </div>
  );
}

/** One section of an editor: the dashboard's hatched frame, a white body. */
export function EditorSection({
  title,
  description,
  icon: Icon,
  action,
  children,
  className,
  bodyClassName,
  id,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("kv-frame flex min-w-0 flex-col p-[4px]", className)}>
      <div className="flex min-h-[30px] items-center justify-between gap-[8px] px-[8px] py-[6px]">
        <h2 className="flex min-w-0 items-center gap-[7px] text-[13px] font-medium leading-none text-kv-secondary-fg">
          {Icon ? <Icon className="h-[14px] w-[14px] shrink-0" strokeWidth={1.6} /> : null}
          <span className="truncate">{title}</span>
        </h2>
        {action}
      </div>
      <div className={cn("min-w-0 rounded-[10px] border-[0.8px] border-kv-input bg-kv-card p-[14px] sm:p-[16px]", bodyClassName)}>
        {description ? <p className="-mt-[2px] mb-[14px] text-[12px] leading-[1.5] text-kv-muted-fg">{description}</p> : null}
        {children}
      </div>
    </section>
  );
}

/** A form-level error returned by the server, shown above the columns. */
export function EditorAlert({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="mb-[12px] rounded-[8px] border-[0.8px] border-red-200 bg-red-50/70 px-[12px] py-[8px] text-[12px] text-red-700">
      {children}
    </div>
  );
}

/**
 * The header's action row without the title, for editors that live under a
 * page that already names what is being edited (a course's tabs).
 */
export function EditorToolbar({
  status,
  meta,
  actions,
}: {
  status?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-[12px] mb-[12px] border-b-[0.8px] border-kv-border bg-kv-card/90 px-[12px] py-[8px] backdrop-blur sm:-mx-[16px] sm:px-[16px]">
      <div className="flex flex-wrap items-center justify-between gap-x-[16px] gap-y-[8px]">
        <div className="flex min-w-0 flex-wrap items-center gap-[8px]">
          {status}
          {meta ? <span className="truncate text-[12px] text-kv-muted-fg">{meta}</span> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-[6px]">{actions}</div> : null}
      </div>
    </div>
  );
}
