import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Menu as MenuIcon } from "lucide-react";

import type {
  FooterData,
  HeaderData,
  MenuData,
  NavItem,
} from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";

const WIDTH_CLASS = {
  narrow: "max-w-4xl",
  wide: "max-w-6xl",
  full: "max-w-none",
};

const TONE_CLASS = {
  light: "bg-white text-zinc-950",
  soft: "bg-zinc-50 text-zinc-950",
  dark: "bg-zinc-950 text-white",
  accent: "bg-[var(--bd-accent,#18181b)] text-white",
  transparent: "bg-transparent text-zinc-950",
};

export function HeaderBlock({ data }: { data: HeaderData }) {
  const tone = data.tone ?? "light";
  const inverse = tone === "dark";
  const items = data.navItems ?? [];
  const hasSecondary = Boolean(data.secondaryLabel);
  const hasPrimary = Boolean(data.primaryLabel);
  const mobileMenu = data.mobileMenu ?? true;
  const showMobileMenu = mobileMenu && Boolean(data.showNav || data.showCta);

  const brandNode = data.showLogo ? (
    <Link
      href="#"
      className={cn(
        "flex min-w-0 items-center gap-3",
        data.layout === "center" && "md:absolute md:left-10"
      )}
    >
      {data.logoUrl ? (
        <Image
          src={data.logoUrl}
          alt=""
          width={40}
          height={40}
          className="h-9 w-9 rounded-lg object-cover"
        />
      ) : (
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold",
            inverse ? "bg-white text-zinc-950" : "bg-zinc-950 text-white"
          )}
        >
          {initials(data.logoText)}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">
          {data.logoText}
        </span>
        {data.tagline ? (
          <span
            className={cn(
              "block truncate text-xs",
              inverse ? "text-zinc-300" : "text-zinc-500"
            )}
          >
            {data.tagline}
          </span>
        ) : null}
      </span>
    </Link>
  ) : null;

  const navNode = data.showNav ? (
    <nav
      className={cn(
        "bd-header-nav flex flex-wrap items-center gap-1.5",
        data.layout === "center" && "justify-center",
        data.layout === "split" && "md:justify-center"
      )}
      aria-label="Page navigation"
    >
      {items.map((item, index) => (
        <NavLink key={`${item.label}-${index}`} item={item} inverse={inverse} />
      ))}
    </nav>
  ) : null;

  const ctaNode = data.showCta ? (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        data.layout === "split" && "md:justify-end",
        data.layout === "center" && "md:absolute md:right-10"
      )}
    >
      {hasSecondary ? (
        <Link
          href={safeHref(data.secondaryHref)}
          className={cn(
            "inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition",
            inverse
              ? "text-zinc-200 hover:bg-white/10 hover:text-white"
              : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
          )}
        >
          {data.secondaryLabel}
        </Link>
      ) : null}
      {hasPrimary ? (
        <Link
          href={safeHref(data.primaryHref)}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition",
            buttonClass(data.buttonStyle ?? "solid", inverse)
          )}
        >
          {data.primaryLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  ) : null;

  return (
    <header
      className={cn(
        "bd-header relative border-b",
        TONE_CLASS[tone],
        inverse ? "border-white/10" : "border-zinc-200",
        data.sticky && "sticky top-0 z-40 backdrop-blur"
      )}
    >
      <div
        className={cn(
          "bd-header-inner mx-auto flex gap-4 px-4 py-3.5 sm:px-6 md:px-10 md:py-4",
          showMobileMenu && "bd-header-hamburger",
          showMobileMenu
            ? "items-center justify-between"
            : "flex-col md:flex-row md:items-center",
          WIDTH_CLASS[data.width ?? "wide"],
          data.layout === "center"
            ? "md:justify-center"
            : "md:justify-between",
          data.layout === "split" && "md:grid md:grid-cols-[1fr_auto_1fr]"
        )}
      >
        {brandNode}

        {showMobileMenu ? (
          <details className="bd-header-mobile-menu group md:hidden">
            <summary
              className={cn(
                "flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border transition marker:hidden [&::-webkit-details-marker]:hidden",
                inverse
                  ? "border-white/15 bg-white/5 hover:bg-white/10"
                  : "border-zinc-200 bg-white hover:bg-zinc-50"
              )}
              aria-label="Open mobile menu"
            >
              <MenuIcon className="h-5 w-5" aria-hidden="true" />
            </summary>
            <div
              className={cn(
                "absolute left-4 right-4 top-[calc(100%+8px)] z-50 rounded-2xl border p-3 shadow-xl",
                inverse
                  ? "border-white/10 bg-zinc-950 text-white"
                  : "border-zinc-200 bg-white text-zinc-950"
              )}
            >
              {data.showNav ? (
                <nav className="grid gap-1" aria-label="Mobile navigation">
                  {items.map((item, index) => (
                    <NavLink
                      key={`${item.label}-${index}`}
                      item={item}
                      inverse={inverse}
                      mobile
                    />
                  ))}
                </nav>
              ) : null}
              {data.showCta && (hasSecondary || hasPrimary) ? (
                <div
                  className={cn(
                    "mt-3 grid gap-2 border-t pt-3",
                    inverse ? "border-white/10" : "border-zinc-200"
                  )}
                >
                  {hasSecondary ? (
                    <Link
                      href={safeHref(data.secondaryHref)}
                      className={cn(
                        "inline-flex min-h-10 items-center justify-center rounded-lg px-3 text-sm font-medium transition",
                        inverse
                          ? "bg-white/5 text-zinc-100 hover:bg-white/10"
                          : "bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                      )}
                    >
                      {data.secondaryLabel}
                    </Link>
                  ) : null}
                  {hasPrimary ? (
                    <Link
                      href={safeHref(data.primaryHref)}
                      className={cn(
                        "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition",
                        buttonClass(data.buttonStyle ?? "solid", inverse)
                      )}
                    >
                      {data.primaryLabel}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
          </details>
        ) : null}

        <div
          className={cn(
            showMobileMenu
              ? "bd-header-desktop-nav hidden md:contents"
              : "bd-header-direct-nav"
          )}
        >
          {navNode}
        </div>

        <div
          className={cn(
            showMobileMenu
              ? "bd-header-desktop-cta hidden md:block"
              : "bd-header-direct-cta",
            data.layout === "split" && "md:justify-self-end"
          )}
        >
          {ctaNode}
        </div>
      </div>
    </header>
  );
}

function NavLink({
  item,
  inverse,
  mobile = false,
}: {
  item: NavItem;
  inverse: boolean;
  mobile?: boolean;
}) {
  return (
    <Link
      href={safeHref(item.href)}
      className={cn(
        "transition",
        mobile
          ? "flex min-h-11 items-center justify-between rounded-xl px-3 text-sm font-medium"
          : "inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium",
        inverse
          ? "text-zinc-200 hover:bg-white/10 hover:text-white"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
      )}
    >
      <span className="truncate">{item.label}</span>
      {item.badge ? (
        <span
          className={cn(
            "ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold",
            inverse ? "bg-white/10 text-zinc-100" : "bg-zinc-100 text-zinc-600"
          )}
        >
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

export function MenuBlock({ data }: { data: MenuData }) {
  const tone = data.tone ?? "light";
  const inverse = tone === "dark" || tone === "accent";
  const layout = data.layout ?? "pills";
  const items = data.items ?? [];
  const align = data.align ?? "center";

  return (
    <section className={cn("px-6 py-10 md:px-10", TONE_CLASS[tone])}>
      <div className={cn("mx-auto", WIDTH_CLASS[data.width ?? "wide"])}>
        {data.showHeader ? (
          <div
            className={cn(
              "mb-6",
              align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"
            )}
          >
            {data.eyebrow ? (
              <p
                className={cn(
                  "text-xs font-semibold uppercase tracking-wider",
                  inverse ? "text-zinc-300" : "text-zinc-500"
                )}
              >
                {data.eyebrow}
              </p>
            ) : null}
            {data.heading ? (
              <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
                {data.heading}
              </h2>
            ) : null}
            {data.description ? (
              <p
                className={cn(
                  "mt-2 text-sm leading-6",
                  inverse ? "text-zinc-300" : "text-zinc-500"
                )}
              >
                {data.description}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className={menuLayoutClass(layout, data.columns ?? 3, align)}>
          {items.map((item, index) => (
            <MenuItem
              key={`${item.label}-${index}`}
              item={item}
              inverse={inverse}
              layout={layout}
              showDescription={data.showDescriptions}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export function FooterBlock({ data }: { data: FooterData }) {
  const tone = data.tone ?? "light";
  const inverse = tone === "dark" || tone === "accent";
  const layout = data.layout ?? "columns";
  const showCta = layout === "cta" && Boolean(data.ctaHeading || data.ctaLabel);
  const navItems = data.navItems ?? [];
  const socialItems = data.showSocial ? (data.socialItems ?? []) : [];

  return (
    <footer
      className={cn(
        "bd-footer border-t",
        TONE_CLASS[tone],
        inverse ? "border-white/10" : "border-zinc-200"
      )}
    >
      <div
        className={cn(
          "bd-footer-shell mx-auto px-5 py-12 sm:px-7 md:px-10 md:py-16",
          WIDTH_CLASS[data.width ?? "wide"]
        )}
      >
        {showCta ? (
          <div
            className={cn(
              "bd-footer-cta relative mb-12 flex flex-col gap-6 overflow-hidden rounded-3xl border p-6 md:flex-row md:items-center md:justify-between md:p-8",
              inverse
                ? "border-white/10 bg-white/[0.06] shadow-2xl shadow-black/20"
                : "border-zinc-200 bg-zinc-50 shadow-xl shadow-zinc-900/5"
            )}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[var(--bd-accent,#f97316)] opacity-20 blur-3xl"
            />
            <div className="relative max-w-2xl">
              {data.ctaHeading ? (
                <h2 className="text-2xl font-semibold leading-tight tracking-tight md:text-3xl">
                  {data.ctaHeading}
                </h2>
              ) : null}
              {data.ctaDescription ? (
                <p
                  className={cn(
                    "mt-1 text-sm leading-6",
                    inverse ? "text-zinc-300" : "text-zinc-500"
                  )}
                >
                  {data.ctaDescription}
                </p>
              ) : null}
            </div>
            {data.ctaLabel ? (
              <Link
                href={safeHref(data.ctaHref)}
                className={cn(
                  "relative inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold shadow-lg transition hover:-translate-y-0.5",
                  inverse ? "bg-white text-zinc-950" : "bg-zinc-950 text-white"
                )}
              >
                {data.ctaLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
        ) : null}

        {layout === "centered" ? (
          <div className="bd-footer-centered mx-auto max-w-3xl text-center">
            {data.showBrand ? <FooterBrand data={data} inverse={inverse} centered /> : null}
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              <FooterInlineLinks items={navItems} inverse={inverse} />
            </div>
            {socialItems.length ? (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <FooterInlineLinks items={socialItems} inverse={inverse} subtle />
              </div>
            ) : null}
          </div>
        ) : layout === "minimal" ? (
          <div className="bd-footer-minimal flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            {data.showBrand ? (
              <p className="shrink-0 text-lg font-semibold tracking-[-0.03em]">{data.brand}</p>
            ) : null}
            <div className="flex flex-wrap gap-2 md:justify-end">
              <FooterInlineLinks items={[...navItems, ...socialItems]} inverse={inverse} subtle />
            </div>
          </div>
        ) : layout === "simple" ? (
          <div className="bd-footer-simple grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-end">
            {data.showBrand ? <FooterBrand data={data} inverse={inverse} /> : null}
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <FooterInlineLinks items={navItems} inverse={inverse} />
              <FooterInlineLinks items={socialItems} inverse={inverse} subtle />
            </div>
          </div>
        ) : (
          <div className="bd-footer-grid grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] lg:gap-16">
            {data.showBrand ? <FooterBrand data={data} inverse={inverse} /> : null}
            <div className="bd-footer-links-grid grid grid-cols-2 gap-8 sm:gap-12">
              <FooterLinkGroup title="Menu" items={navItems} inverse={inverse} />
              {socialItems.length ? (
                <FooterLinkGroup title="Social" items={socialItems} inverse={inverse} />
              ) : null}
            </div>
          </div>
        )}

        {data.showCopyright ? (
          <div
            className={cn(
              "bd-footer-bottom mt-12 flex flex-col gap-2 border-t pt-6 text-xs sm:flex-row sm:items-center sm:justify-between",
              layout === "centered" && "text-center sm:justify-center sm:gap-3",
              inverse ? "border-white/10 text-zinc-400" : "border-zinc-200 text-zinc-500"
            )}
          >
            <span>© {data.brand}</span>
            <span>{data.copyright}</span>
          </div>
        ) : null}
      </div>
    </footer>
  );
}

function FooterBrand({
  data,
  inverse,
  centered = false,
}: {
  data: FooterData;
  inverse: boolean;
  centered?: boolean;
}) {
  return (
    <div className={cn("bd-footer-brand min-w-0", centered ? "mx-auto max-w-xl" : "max-w-md")}>
      <p className="text-2xl font-semibold tracking-[-0.03em]">{data.brand}</p>
      {data.description ? (
        <p
          className={cn(
            "mt-3 text-sm leading-7",
            !centered && "max-w-sm",
            inverse ? "text-zinc-300" : "text-zinc-500"
          )}
        >
          {data.description}
        </p>
      ) : null}
    </div>
  );
}

function FooterInlineLinks({
  items,
  inverse,
  subtle = false,
}: {
  items: NavItem[];
  inverse: boolean;
  subtle?: boolean;
}) {
  return items.map((item, index) => (
    <Link
      key={`${item.label}-${index}`}
      href={safeHref(item.href)}
      className={cn(
        "inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium transition",
        inverse
          ? subtle
            ? "text-zinc-400 hover:bg-white/10 hover:text-white"
            : "bg-white/[0.07] text-zinc-200 hover:bg-white/15 hover:text-white"
          : subtle
            ? "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"
            : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 hover:text-zinc-950"
      )}
    >
      {item.label}
    </Link>
  ));
}

function MenuItem({
  item,
  inverse,
  layout,
  showDescription,
}: {
  item: NavItem;
  inverse: boolean;
  layout: MenuData["layout"];
  showDescription?: boolean;
}) {
  const isCard = layout === "grid" || layout === "list";
  return (
    <Link
      href={safeHref(item.href)}
      className={cn(
        "group transition",
        isCard
          ? cn(
              "flex min-h-16 items-start justify-between gap-3 rounded-xl border p-4",
              inverse
                ? "border-white/10 bg-white/5 hover:bg-white/10"
                : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
            )
          : cn(
              "inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium",
              inverse
                ? "border-white/10 bg-white/5 text-white hover:bg-white/10"
                : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50"
            )
      )}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          {layout === "compact" ? <MenuIcon className="h-3.5 w-3.5" /> : null}
          <span className="font-medium">{item.label}</span>
          {item.badge ? (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                inverse ? "bg-white/10 text-zinc-100" : "bg-zinc-100 text-zinc-500"
              )}
            >
              {item.badge}
            </span>
          ) : null}
        </span>
        {showDescription && item.description ? (
          <span
            className={cn(
              "mt-1 block text-xs leading-5",
              inverse ? "text-zinc-300" : "text-zinc-500"
            )}
          >
            {item.description}
          </span>
        ) : null}
      </span>
      {isCard ? (
        <ArrowRight
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 transition group-hover:translate-x-0.5",
            inverse ? "text-zinc-400" : "text-zinc-400"
          )}
        />
      ) : null}
    </Link>
  );
}

function FooterLinkGroup({
  title,
  items,
  inverse,
}: {
  title: string;
  items: NavItem[];
  inverse: boolean;
}) {
  if (!items.length) return null;
  return (
    <div className="min-w-0">
      <p className={cn("text-xs font-semibold uppercase tracking-[0.18em]", inverse ? "text-zinc-400" : "text-zinc-500")}>
        {title}
      </p>
      <div className="mt-4 grid gap-1">
        {items.map((item, index) => (
          <Link
            key={`${title}-${item.label}-${index}`}
            href={safeHref(item.href)}
            className={cn(
              "group flex items-center justify-between gap-3 rounded-lg py-1.5 text-sm transition",
              inverse ? "text-zinc-300 hover:text-white" : "text-zinc-600 hover:text-zinc-950"
            )}
          >
            <span>{item.label}</span>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function menuLayoutClass(
  layout: MenuData["layout"],
  columns: 2 | 3 | 4,
  align: "left" | "center"
) {
  if (layout === "grid") {
    return cn(
      "grid gap-3",
      columns === 4
        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
        : columns === 2
          ? "grid-cols-1 sm:grid-cols-2"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
    );
  }
  if (layout === "list") return "grid gap-3";
  return cn("flex flex-wrap gap-2", align === "center" ? "justify-center" : "justify-start");
}

function buttonClass(style: HeaderData["buttonStyle"], inverse: boolean) {
  if (style === "outline") {
    return inverse
      ? "border border-white/20 text-white hover:bg-white/10"
      : "border border-zinc-300 text-zinc-900 hover:bg-zinc-100";
  }
  if (style === "soft") {
    return inverse
      ? "bg-white/10 text-white hover:bg-white/15"
      : "bg-zinc-100 text-zinc-950 hover:bg-zinc-200";
  }
  return inverse ? "bg-white text-zinc-950" : "bg-zinc-950 text-white";
}

function safeHref(href: string | undefined) {
  const value = href?.trim();
  return value || "#";
}

function initials(value: string | undefined) {
  const text = value?.trim() || "B";
  return text
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
