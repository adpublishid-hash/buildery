import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CalendarDays, Clock3, Newspaper, Search } from "lucide-react";

import { publicSiteContextHref } from "@/lib/public-url-server";
import { getStoreWorkspace } from "@/lib/store";
import {
  publicBlogIndex,
  publicBlogTaxonomy,
  type PublicBlogPost,
} from "@/lib/public-blog";
import { resolveContent } from "@/lib/storefront-content";
import { getPageContent } from "@/lib/storefront-content-server";
import { Badge } from "@/components/ui/badge";
import { parsePage } from "@/components/ui/pagination";
import { StoreHeader } from "@/components/store/store-header";
import { cn, formatDate } from "@/lib/utils";
import { stripRichText } from "@/lib/rich-text";
import { publicSiteUrl } from "@/lib/public-url";

export const revalidate = 300;

const PUBLIC_PAGE_SIZE = 13;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: { workspaceSlug: string };
  searchParams?: { q?: string; category?: string; tag?: string; page?: string };
}): Promise<Metadata> {
  const workspace = await getStoreWorkspace(params.workspaceSlug);
  if (!workspace) return { title: "Blog not found" };
  const filtered = Boolean(
    searchParams?.q || searchParams?.category || searchParams?.tag
  );
  const page = parsePage(searchParams?.page);
  const canonical =
    page > 1
      ? `${publicSiteUrl(workspace.slug, "blog")}?page=${page}`
      : publicSiteUrl(workspace.slug, "blog");
  return {
    title: { absolute: `Blog · ${workspace.name}` },
    description: `Updates, notes, and announcements from ${workspace.name}.`,
    alternates: {
      canonical,
      types: {
        "application/rss+xml": publicSiteUrl(
          workspace.slug,
          "blog/feed.xml"
        ),
      },
    },
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function PublicBlogIndexPage({
  params,
  searchParams,
}: {
  params: { workspaceSlug: string };
  searchParams?: { q?: string; category?: string; tag?: string; page?: string };
}) {
  const workspace = await getStoreWorkspace(params.workspaceSlug);
  if (!workspace) notFound();

  const q = searchParams?.q?.trim() ?? "";
  const category = searchParams?.category?.trim() ?? "";
  const tag = searchParams?.tag?.trim() ?? "";
  const page = parsePage(searchParams?.page);
  const [result, taxonomy] = await Promise.all([
    publicBlogIndex({
      workspaceId: workspace.id,
      query: q,
      category,
      tag,
      page,
      pageSize: PUBLIC_PAGE_SIZE,
    }),
    publicBlogTaxonomy(workspace.id),
  ]);
  const posts = result.posts;
  const categories = taxonomy.categories;
  const tags = taxonomy.tags;
  const totalPublished = taxonomy.total;
  const matchingPosts = result.total;
  const totalPages = Math.max(1, Math.ceil(matchingPosts / PUBLIC_PAGE_SIZE));
  const pageHref = (target: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (category) sp.set("category", category);
    if (tag) sp.set("tag", tag);
    if (target > 1) sp.set("page", String(target));
    const qs = sp.toString();
    return publicSiteContextHref(workspace.slug, qs ? `blog?${qs}` : "blog");
  };

  // Only the first page leads with a featured article; later pages are a plain grid.
  const featured = page === 1 ? posts[0] : undefined;
  const rest = page === 1 ? posts.slice(1) : posts;
  const filtering = Boolean(q || category || tag);
  const content = resolveContent(
    "blog_catalog",
    await getPageContent(workspace.id, "blog_catalog"),
    {
      eyebrow: "Blog",
      heading: `Updates from ${workspace.name}`,
      subheading: "Notes, guides, announcements, and stories from the team.",
    }
  );

  return (
    <div className="min-h-screen bg-white">
      <StoreHeader
        workspaceSlug={workspace.slug}
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        logoUrl={workspace.logoUrl}
      />

      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 lg:grid-cols-[0.72fr_0.28fr] lg:items-start">
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              {content.eyebrow}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
              {content.heading}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
              {content.subheading}
            </p>
          </section>

          <form className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                name="q"
                defaultValue={q}
                placeholder="Search articles..."
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-zinc-100"
              />
            </div>
            {category ? (
              <input type="hidden" name="category" value={category} />
            ) : null}
            {tag ? <input type="hidden" name="tag" value={tag} /> : null}
          </form>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          <FilterChip
            href={publicSiteContextHref(workspace.slug, "blog")}
            active={!category && !tag}
            count={totalPublished}
          >
            All
          </FilterChip>
          {categories.map((item) => (
            <FilterChip
              key={item.slug}
              href={publicSiteContextHref(
                workspace.slug,
                `blog?category=${item.slug}`
              )}
              active={category === item.slug}
              count={item.count}
            >
              {item.name}
            </FilterChip>
          ))}
          {tags.map((item) => (
            <FilterChip
              key={item.slug}
              href={publicSiteContextHref(
                workspace.slug,
                `blog?tag=${item.slug}`
              )}
              active={tag === item.slug}
            >
              #{item.name}
            </FilterChip>
          ))}
        </div>

        {posts.length === 0 ? (
          <div className="mt-16 flex flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100">
              <Newspaper className="h-6 w-6 text-zinc-400" />
            </div>
            <p className="text-sm font-medium text-zinc-900">No posts found</p>
            <p className="mt-1 text-xs text-zinc-500">
              Try a different search or category.
            </p>
          </div>
        ) : (
          <div className="mt-10 space-y-10">
            {featured ? (
              <ArticleCard
                post={featured}
                workspaceSlug={workspace.slug}
                featured
                showFeaturedTag={!filtering}
              />
            ) : null}
            {rest.length > 0 ? (
              <div>
                <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  More articles
                </p>
                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {rest.map((post) => (
                    <ArticleCard
                      key={post.postId}
                      post={post}
                      workspaceSlug={workspace.slug}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {totalPages > 1 ? (
              <nav
                aria-label="Blog pages"
                className="flex items-center justify-between border-t border-zinc-100 pt-6 text-sm"
              >
                {page > 1 ? (
                  <Link href={pageHref(page - 1)} className="font-medium text-zinc-900 hover:underline">
                    ← Newer articles
                  </Link>
                ) : (
                  <span />
                )}
                <span className="text-xs text-zinc-400">
                  Page {page} of {totalPages}
                </span>
                {page < totalPages ? (
                  <Link href={pageHref(page + 1)} className="font-medium text-zinc-900 hover:underline">
                    Older articles →
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}

function FilterChip({
  href,
  active,
  count,
  children,
}: {
  href: string;
  active: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
        active
          ? "border-zinc-900 bg-zinc-900 text-white"
          : "border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
      )}
    >
      {children}
      {typeof count === "number" ? (
        <span
          className={cn(
            "tabular-nums",
            active ? "text-zinc-400" : "text-zinc-400"
          )}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}

function CoverFallback({ size = "default" }: { size?: "default" | "large" }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-50 via-zinc-100 to-zinc-50">
      <Newspaper
        className={cn(
          "text-zinc-300",
          size === "large" ? "h-10 w-10" : "h-8 w-8"
        )}
      />
    </div>
  );
}

function ArticleCard({
  post,
  workspaceSlug,
  featured = false,
  showFeaturedTag = false,
}: {
  post: PublicBlogPost;
  workspaceSlug: string;
  featured?: boolean;
  showFeaturedTag?: boolean;
}) {
  const href = publicSiteContextHref(workspaceSlug, `blog/${post.slug}`);
  return (
    <Link
      href={href}
      className={cn(
        "group overflow-hidden rounded-xl border border-zinc-200 bg-white transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md",
        featured && "grid md:grid-cols-[1.05fr_0.95fr]"
      )}
    >
      <div
        className={cn(
          "relative bg-zinc-50",
          featured ? "aspect-[16/10] md:h-full" : "aspect-[16/10]"
        )}
      >
        {post.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            loading="lazy"
            decoding="async"
            src={post.imageUrl}
            alt={post.imageAlt ?? ""}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <CoverFallback size={featured ? "large" : "default"} />
        )}
        {featured && showFeaturedTag ? (
          <span className="absolute left-4 top-4 inline-flex items-center rounded-full bg-zinc-900/90 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
            Featured
          </span>
        ) : null}
      </div>
      <div
        className={cn(
          "flex flex-col",
          featured ? "p-6 sm:p-8" : "p-5"
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          {post.categoryName ? (
            <Badge variant="secondary">{post.categoryName}</Badge>
          ) : null}
          <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
            <CalendarDays className="h-3.5 w-3.5" />
            {post.publishedAt ? formatDate(post.publishedAt) : "Latest"}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
            <Clock3 className="h-3.5 w-3.5" />
            {readMinutes(post.body)} min read
          </span>
        </div>
        <h2
          className={cn(
            "mt-3 font-semibold tracking-tight text-zinc-900 group-hover:underline",
            featured ? "text-2xl sm:text-3xl" : "text-lg"
          )}
        >
          {post.title}
        </h2>
        {post.excerpt ? (
          <p
            className={cn(
              "mt-2 text-sm leading-6 text-zinc-600",
              featured ? "line-clamp-3" : "line-clamp-2"
            )}
          >
            {post.excerpt}
          </p>
        ) : null}
        {post.authorName ? (
          <p className="mt-5 inline-flex items-center gap-2 text-xs font-medium text-zinc-500">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-semibold text-white">
              {authorInitials(post.authorName)}
            </span>
            {post.authorName}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

function authorInitials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "·";
}

function readMinutes(body: string) {
  const words = stripRichText(body).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}
