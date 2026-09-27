import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";

/**
 * Width of the marketing pages: edge to edge like the dashboard, with a cap
 * only so lines stay readable on very wide monitors.
 */
export const MARKETING_CONTAINER = "mx-auto w-full max-w-[1440px] px-[16px] sm:px-[24px] lg:px-[40px]";

/** The landing page reads narrower than the rest of the marketing site. */
export const LANDING_CONTAINER = "mx-auto w-full max-w-[1120px] px-[16px] sm:px-[24px]";

const NAV = [
  { href: "/#fitur", label: "Fitur" },
  { href: "/#cara-kerja", label: "Cara kerja" },
  { href: "/pricing", label: "Harga" },
  { href: "/#faq", label: "FAQ" },
];

export function SiteHeader({
  isAuthed,
  loginCallbackUrl,
  container = MARKETING_CONTAINER,
}: {
  isAuthed: boolean;
  loginCallbackUrl?: string;
  container?: string;
}) {
  const loginHref = loginCallbackUrl ? `/login?callbackUrl=${encodeURIComponent(loginCallbackUrl)}` : "/login";
  return (
    <header className="sticky top-0 z-40 border-b-[0.8px] border-kv-border bg-kv-bg/85 backdrop-blur">
      <div className={`${container} flex h-[56px] items-center justify-between gap-[16px]`}>
        <Link href="/" className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-kv-ring/40">
          <BrandLogo className="text-[16px]" />
        </Link>

        <nav className="hidden items-center gap-[24px] text-[13px] text-kv-muted-fg md:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="transition-colors hover:text-kv-fg">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-[6px]">
          {isAuthed ? (
            <Button asChild size="sm">
              <Link href="/dashboard">
                Dashboard <ArrowRight />
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href={loginHref}>Masuk</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Mulai gratis</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ container = MARKETING_CONTAINER }: { container?: string }) {
  return (
    <footer className="border-t-[0.8px] border-kv-border">
      <div
        className={`${container} flex flex-col gap-[10px] py-[20px] text-[12px] text-kv-muted-fg sm:flex-row sm:items-center sm:justify-between`}
      >
        <span>
          <BrandLogo className="mr-[8px] text-[13px]" />© {new Date().getFullYear()} — bangun, jual, tumbuh.
        </span>
        <div className="flex gap-[16px]">
          <Link href="/pricing" className="hover:text-kv-fg">Harga</Link>
          <Link href="/login" className="hover:text-kv-fg">Masuk</Link>
          <Link href="/register" className="hover:text-kv-fg">Mulai gratis</Link>
        </div>
      </div>
    </footer>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  as: Tag = "h2",
}: {
  eyebrow: string;
  title: string;
  description?: string;
  as?: "h1" | "h2";
}) {
  return (
    <div className="mx-auto max-w-[620px] text-center">
      <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-kv-muted-fg">{eyebrow}</p>
      <Tag className="mt-[10px] text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-kv-fg sm:text-[34px]">
        {title}
      </Tag>
      {description ? (
        <p className="mt-[12px] text-[14px] leading-[1.6] text-kv-muted-fg">{description}</p>
      ) : null}
    </div>
  );
}
