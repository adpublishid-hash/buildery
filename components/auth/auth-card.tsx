import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { cn } from "@/lib/utils";

/**
 * The page around sign-in, sign-up, password and onboarding screens: the
 * dashboard's grey canvas with the logo on top and one narrow column.
 */
export function AuthFrame({
  children,
  logoHref = "/",
  back,
  width = "max-w-[400px]",
}: {
  children: React.ReactNode;
  logoHref?: string;
  back?: { href: string; label: string };
  width?: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-kv-bg text-kv-fg">
      <header className="flex h-[56px] shrink-0 items-center justify-between px-[16px] sm:px-[24px]">
        <Link
          href={logoHref}
          className="flex items-center gap-[10px] rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-kv-ring/40"
        >
          <BrandLogo className="text-[16px]" />
        </Link>
        {back ? (
          <Link
            href={back.href}
            className="group inline-flex items-center gap-[6px] text-[13px] text-kv-muted-fg transition-colors hover:text-kv-fg"
          >
            <ArrowLeft className="h-[14px] w-[14px] transition-transform group-hover:-translate-x-0.5" />
            {back.label}
          </Link>
        ) : null}
      </header>

      <main className="flex flex-1 items-center justify-center px-[16px] py-[24px]">
        <div className={cn("w-full", width)}>{children}</div>
      </main>

      <footer className="shrink-0 pb-[20px] text-center text-[12px] text-kv-subtle">
        © {new Date().getFullYear()} My Landing
      </footer>
    </div>
  );
}

/**
 * One auth step as a dashboard panel: a hatched frame whose strip names the
 * step, and a white card with the heading and the form. Anything in `footer`
 * sits under the card (the "no account yet?" links).
 */
export function AuthCard({
  eyebrow,
  icon: Icon,
  title,
  description,
  children,
  footer,
  className,
}: {
  eyebrow: string;
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("animate-kv-rise", className)}>
      <section className="kv-frame flex flex-col p-[4px]">
        <div className="flex items-center justify-between gap-[8px] px-[8px] py-[6px]">
          <span className="text-[13px] font-medium leading-none text-kv-secondary-fg">{eyebrow}</span>
          {Icon ? <Icon className="h-[16px] w-[16px] text-kv-secondary-fg" strokeWidth={1.6} /> : null}
        </div>
        <div className="rounded-[10px] border-[0.8px] border-kv-input bg-kv-card p-[20px] sm:p-[24px]">
          <div className="flex flex-col gap-[6px]">
            <h1 className="text-[20px] font-semibold leading-tight tracking-[-0.01em] text-kv-fg">{title}</h1>
            {description ? (
              <p className="text-[13px] leading-[1.5] text-kv-muted-fg">{description}</p>
            ) : null}
          </div>
          <div className="mt-[20px]">{children}</div>
        </div>
      </section>
      {footer ? (
        <p className="mt-[14px] text-center text-[13px] text-kv-muted-fg">{footer}</p>
      ) : null}
    </div>
  );
}

/** Inline link used in auth footers ("Daftar gratis", "Masuk"). */
export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-kv-fg underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}

/** A field's validation message. */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[12px] leading-[1.4] text-kv-destructive">{message}</p>;
}

/** A form-level error returned by the server. */
export function FormAlert({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="animate-kv-fade rounded-[8px] border-[0.8px] border-red-200 bg-red-50/70 px-[10px] py-[8px] text-[12px] leading-[1.4] text-red-700"
    >
      {children}
    </div>
  );
}

/** A quiet "done" state: round icon, a line of heading, a line of detail. */
export function AuthNotice({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex animate-kv-fade flex-col items-center gap-[8px] py-[4px] text-center">
      <span className="mb-[4px] flex h-[40px] w-[40px] items-center justify-center rounded-full border-[0.8px] border-kv-border bg-kv-secondary text-kv-fg">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
      </span>
      <p className="text-[14px] font-medium text-kv-fg">{title}</p>
      {children ? <div className="text-[13px] leading-[1.5] text-kv-muted-fg">{children}</div> : null}
      {action ? <div className="mt-[8px] w-full">{action}</div> : null}
    </div>
  );
}
