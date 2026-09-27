import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, CalendarDays, Clock3, Newspaper, Tag } from "lucide-react";

import { publicSiteContextHref } from "@/lib/public-url-server";
import { getStoreWorkspace } from "@/lib/store";
import {
  findBlogSlugRedirect,
  publicBlogPost,
  publicBlogRelated,
} from "@/lib/public-blog";
import { resolveContent } from "@/lib/storefront-content";
import { getPageContent } from "@/lib/storefront-content-server";
import { Badge } from "@/components/ui/badge";
import { StoreHeader } from "@/components/store/store-header";
import { formatDate } from "@/lib/utils";
import { PostContent } from "@/components/blog/post-content";
import { ReadingProgress } from "@/components/blog/reading-progress";
import { ShareBar } from "@/components/blog/share-bar";
import { TableOfContents } from "@/components/blog/table-of-contents";
import { renderPostBody } from "@/lib/blog-toc";
import { stripRichText } from "@/lib/rich-text";
import { publicSiteUrl } from "@/lib/public-url";
import { BlogEngagementTracker } from "@/components/blog/blog-engagement-tracker";

export const revalidate = 300;

type Params = { workspaceSlug: string; postSlug: string };

async function load(params: Params) {
  const workspace = await getStoreWorkspace(params.workspaceSlug);
  if (!workspace) return null;
  const post = await publicBlogPost(workspace.id, params.postSlug);
  if (!post) return null;
  const related = await publicBlogRelated(post);
  return { workspace, post, related };
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const result = await load(params);
  if (!result) return { title: "Post not found" };
  const title = result.post.seoTitle?.trim() || result.post.title;
  const description =
    result.post.metaDescription?.trim() || result.post.excerpt || undefined;
  const canonical =
    result.post.canonicalUrl ||
    publicSiteUrl(result.workspace.slug, `blog/${result.post.slug}`);
  return {
    title: { absolute: `${title} · ${result.workspace.name}` },
    description,
    alternates: { canonical },
    robots: result.post.noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      title,
      description,
      images: result.post.imageUrl
        ? [{ url: result.post.imageUrl, alt: result.post.imageAlt ?? title }]
        : undefined,
      siteName: result.workspace.name,
      type: "article",
      publishedTime: result.post.publishedAt ?? undefined,
      modifiedTime: result.post.modifiedAt,
      authors: result.post.authorName ? [result.post.authorName] : undefined,
    },
    twitter: {
      card: result.post.imageUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: result.post.imageUrl ? [result.post.imageUrl] : undefined,
    },
  };
}

export default async function PublicBlogPostPage({
  params,
}: {
  params: Params;
}) {
  const result = await load(params);
  if (!result) {
    const workspace = await getStoreWorkspace(params.workspaceSlug);
    if (workspace) {
      const moved = await findBlogSlugRedirect(workspace.id, params.postSlug);
      if (moved) {
        permanentRedirect(
          publicSiteContextHref(workspace.slug, `blog/${moved}`)
        );
      }
    }
    notFound();
  }
  const { workspace, post, related } = result;
  const readTime = readMinutes(post.body);
  const { html, headings } = renderPostBody(post.body);
  const articleUrl = publicSiteUrl(workspace.slug, `blog/${post.slug}`);
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.metaDescription || post.excerpt || undefined,
    image: post.imageUrl || undefined,
    datePublished: post.publishedAt || undefined,
    dateModified: post.modifiedAt,
    author: post.authorName
      ? { "@type": "Person", name: post.authorName }
      : { "@type": "Organization", name: workspace.name },
    publisher: { "@type": "Organization", name: workspace.name },
    mainEntityOfPage: articleUrl,
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Blog",
        item: publicSiteUrl(workspace.slug, "blog"),
      },
      { "@type": "ListItem", position: 2, name: post.title, item: articleUrl },
    ],
  };
  const content = resolveContent(
    "blog_single",
    await getPageContent(workspace.id, "blog_single"),
    { backLabel: "Back to blog", relatedHeading: "Related posts" }
  );

  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(articleJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <BlogEngagementTracker
        workspaceId={workspace.id}
        postId={post.postId}
      />
      <ReadingProgress />
      <StoreHeader
        workspaceSlug={workspace.slug}
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        logoUrl={workspace.logoUrl}
      />

      <main>
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_200px]">
            <article className="mx-auto w-full max-w-3xl xl:mx-0">
              <Link
                href={publicSiteContextHref(workspace.slug, "blog")}
                className="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {content.backLabel}
              </Link>

              <div className="mt-8 flex flex-wrap items-center gap-2">
                {post.categoryName && post.categorySlug ? (
                  <Link
                    href={publicSiteContextHref(
                      workspace.slug,
                      `blog?category=${post.categorySlug}`
                    )}
                  >
                    <Badge variant="secondary">{post.categoryName}</Badge>
                  </Link>
                ) : null}
                <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {post.publishedAt ? formatDate(post.publishedAt) : null}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                  <Clock3 className="h-3.5 w-3.5" />
                  {readTime} min read
                </span>
              </div>

              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
                {post.title}
              </h1>

              {post.excerpt ? (
                <p className="mt-5 max-w-2xl text-lg leading-relaxed text-zinc-600">
                  {post.excerpt}
                </p>
              ) : null}

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
                    {authorInitials(post.authorName)}
                  </span>
                  <div className="leading-tight">
                    <p className="text-sm font-medium text-zinc-900">
                      {post.authorName ?? "Unknown author"}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {post.publishedAt
                        ? formatDate(post.publishedAt)
                        : "Draft"}
                    </p>
                  </div>
                </div>
                <ShareBar
                  title={post.title}
                  workspaceId={workspace.id}
                  postId={post.postId}
                />
              </div>

              {post.imageUrl ? (
                <figure className="mt-8 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    loading="lazy"
                    decoding="async"
                    src={post.imageUrl}
                    alt={post.imageAlt ?? ""}
                    className="aspect-[16/9] w-full object-cover"
                  />
                  {post.imageCaption ? (
                    <figcaption className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500">
                      {post.imageCaption}
                    </figcaption>
                  ) : null}
                </figure>
              ) : null}

              <PostContent html={html} />

              {post.tags.length > 0 ? (
                <div className="mt-10 flex flex-wrap gap-2 border-t border-zinc-100 pt-6">
                  {post.tags.map((tag) => (
                    <Link
                      key={tag.slug}
                      href={publicSiteContextHref(
                        workspace.slug,
                        `blog?tag=${tag.slug}`
                      )}
                      className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
                    >
                      <Tag className="h-3 w-3" />
                      {tag.name}
                    </Link>
                  ))}
                </div>
              ) : null}
            </article>

            <aside className="hidden xl:block">
              <div className="sticky top-24">
                <TableOfContents headings={headings} />
              </div>
            </aside>
          </div>
        </div>

        {related.length > 0 ? (
          <section className="border-t border-zinc-100 px-6 py-12">
            <div className="mx-auto max-w-5xl">
              <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
                {content.relatedHeading}
              </h2>
              <div className="mt-5 grid gap-5 md:grid-cols-3">
                {related.map((item) => (
                  <Link
                    key={item.postId}
                    href={publicSiteContextHref(
                      workspace.slug,
                      `blog/${item.slug}`
                    )}
                    className="group overflow-hidden rounded-xl border border-zinc-200 bg-white transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="aspect-[16/10] bg-zinc-50">
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          loading="lazy"
                          decoding="async"
                          src={item.imageUrl}
                          alt={item.imageAlt ?? ""}
                          className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Newspaper className="h-7 w-7 text-zinc-300" />
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      {item.categoryName ? (
                        <Badge variant="secondary">{item.categoryName}</Badge>
                      ) : null}
                      <h3 className="mt-2 text-sm font-semibold text-zinc-950 group-hover:underline">
                        {item.title}
                      </h3>
                      {item.excerpt ? (
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">
                          {item.excerpt}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function authorInitials(name: string | null | undefined) {
  if (!name) return "·";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  return letters || "·";
}

function readMinutes(body: string) {
  const words = stripRichText(body).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}
