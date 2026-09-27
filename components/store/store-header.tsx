import Link from "next/link";
import { ShoppingCart, UserCircle } from "lucide-react";

import { publicSiteContextHref } from "@/lib/public-url-server";
import { prisma } from "@/lib/prisma";
import { cartCount, readCart } from "@/lib/store";
import { getMemberSession } from "@/lib/member-auth";
import { resolveStoreNav, resolveCustomLinks } from "@/lib/storefront-nav";
import { getInitials } from "@/lib/utils";

function customLinkTarget(workspaceSlug: string, href: string) {
  const h = href.trim();
  if (/^https?:\/\//i.test(h)) return { href: h, external: true };
  if (h.startsWith("#")) return { href: h, external: false };
  return {
    href: publicSiteContextHref(workspaceSlug, h.replace(/^\/+/, "")),
    external: false,
  };
}

type Props = {
  workspaceSlug: string;
  workspaceName: string;
  workspaceId: string;
  logoUrl?: string | null;
};

/** Shared top bar for the public store pages. */
export async function StoreHeader({
  workspaceSlug,
  workspaceName,
  workspaceId,
  logoUrl,
}: Props) {
  const cart = readCart();
  const count = cart.workspaceId === workspaceId ? cartCount(cart) : 0;
  const [member, blog, course, product, membership, storefront] =
    await Promise.all([
      getMemberSession(workspaceSlug),
      prisma.blogPost.findFirst({
        where: {
          workspaceId,
          status: { in: ["PUBLISHED", "SCHEDULED"] },
          publishedVersion: { not: null },
        },
        select: { id: true },
      }),
      prisma.course.findFirst({
        where: { workspaceId, status: "PUBLISHED" },
        select: { id: true },
      }),
      prisma.product.findFirst({
        where: { workspaceId, status: "ACTIVE" },
        select: { id: true },
      }),
      prisma.membershipPlan.findFirst({
        where: { workspaceId, isActive: true },
        select: { id: true },
      }),
      prisma.storefrontSetting.findUnique({ where: { workspaceId } }),
    ]);
  const nav = resolveStoreNav(storefront);
  const customLinks = resolveCustomLinks(storefront);
  const homeHref = publicSiteContextHref(workspaceSlug);
  const navItems = [
    blog ? { label: nav.blog, path: "blog" } : null,
    course ? { label: nav.courses, path: "courses" } : null,
    product ? { label: nav.products, path: "products" } : null,
    membership ? { label: nav.memberships, path: "memberships" } : null,
  ].filter((item): item is { label: string; path: string } => Boolean(item));
  const showCommerceLinks =
    Boolean(course || product || membership) || count > 0 || Boolean(member);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link
          href={homeHref}
          className="flex min-w-0 items-center gap-2"
        >
          <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-md bg-zinc-900 text-xs font-semibold text-white">
            {logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img loading="lazy" decoding="async" src={logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              getInitials(workspaceName)
            )}
          </span>
          <span className="text-sm font-semibold text-zinc-900">
            {workspaceName}
          </span>
        </Link>

        {navItems.length > 0 || customLinks.length > 0 || showCommerceLinks ? (
          <nav className="ml-4 flex min-w-0 items-center gap-4 overflow-x-auto whitespace-nowrap text-sm sm:gap-5">
            {navItems.map((item) => (
              <Link
                key={item.path}
                href={publicSiteContextHref(workspaceSlug, item.path)}
                className="text-zinc-600 transition-colors hover:text-zinc-900"
              >
                {item.label}
              </Link>
            ))}
            {customLinks.map((link, i) => {
              const t = customLinkTarget(workspaceSlug, link.href);
              return t.external ? (
                <a
                  key={`custom-${i}`}
                  href={t.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-600 transition-colors hover:text-zinc-900"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={`custom-${i}`}
                  href={t.href}
                  className="text-zinc-600 transition-colors hover:text-zinc-900"
                >
                  {link.label}
                </Link>
              );
            })}
            {showCommerceLinks ? (
              <>
                <Link
                  href={publicSiteContextHref(workspaceSlug, "cart")}
                  className="relative flex items-center gap-1.5 text-zinc-600 transition-colors hover:text-zinc-900"
                >
                  <ShoppingCart className="h-4 w-4" />
                  <span className="hidden sm:inline">{nav.cart}</span>
                  {count > 0 ? (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-zinc-900 px-1 text-[10px] font-semibold text-white">
                      {count}
                    </span>
                  ) : null}
                </Link>
                <Link
                  href={publicSiteContextHref(
                    workspaceSlug,
                    member ? "member/account" : "member/login"
                  )}
                  className="flex items-center gap-1.5 text-zinc-600 transition-colors hover:text-zinc-900"
                >
                  <UserCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {member ? nav.account : nav.login}
                  </span>
                </Link>
              </>
            ) : null}
          </nav>
        ) : null}
      </div>
    </header>
  );
}
