import Link from "next/link";
import { FileText, Newspaper, Plus, Search, Settings2, Tags } from "lucide-react";
import type { BlogPostStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { PostRowActions } from "@/components/blog/post-row-actions";
import { formatDate } from "@/lib/utils";
import { stripRichText } from "@/lib/rich-text";
import { Pagination, parsePage } from "@/components/ui/pagination";

export const metadata = { title: "Blog · My Landing" };

const STATUS_VARIANT: Record<
  BlogPostStatus,
  "default" | "secondary" | "success" | "outline"
> = {
  DRAFT: "secondary",
  SCHEDULED: "outline",
  PUBLISHED: "success",
  ARCHIVED: "default",
};

const PAGE_SIZE = 50;

export default async function BlogPostsPage({
  searchParams,
}: {
  searchParams?: { q?: string; status?: string; category?: string; page?: string };
}) {
  const { workspace, role } = await requireCurrentWorkspace();
  const canEdit = canInWorkspace(role, "content.edit");
  const q = searchParams?.q?.trim() ?? "";
  const status = ["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"].includes(
    searchParams?.status ?? ""
  )
    ? (searchParams?.status as BlogPostStatus)
    : "";
  const category = searchParams?.category?.trim() ?? "";

  const page = parsePage(searchParams?.page);
  const postWhere: Prisma.BlogPostWhereInput = {
      workspaceId: workspace.id,
      ...(status ? { status: status as BlogPostStatus } : {}),
      ...(category ? { category: { slug: category } } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { excerpt: { contains: q, mode: "insensitive" } },
              { body: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
  };
  const [posts, matchingPosts] = await Promise.all([
    prisma.blogPost.findMany({
    where: postWhere,
    include: {
      author: { select: { name: true } },
      category: { select: { name: true, slug: true } },
      _count: { select: { tags: true, events: true } },
    },
    orderBy: { updatedAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    }),
    prisma.blogPost.count({ where: postWhere }),
  ]);
  const [
    allCount,
    publishedCount,
    draftCount,
    scheduledCount,
    archivedCount,
    categories,
    engagement,
  ] = await Promise.all([
    prisma.blogPost.count({ where: { workspaceId: workspace.id } }),
    prisma.blogPost.count({
      where: { workspaceId: workspace.id, status: "PUBLISHED" },
    }),
    prisma.blogPost.count({
      where: { workspaceId: workspace.id, status: "DRAFT" },
    }),
    prisma.blogPost.count({
      where: { workspaceId: workspace.id, status: "SCHEDULED" },
    }),
    prisma.blogPost.count({
      where: { workspaceId: workspace.id, status: "ARCHIVED" },
    }),
    prisma.blogCategory.findMany({
      where: { workspaceId: workspace.id },
      include: { _count: { select: { posts: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.blogPostEvent.groupBy({
      by: ["postId", "type"],
      where: { workspaceId: workspace.id },
      _count: { _all: true },
    }),
  ]);
  const engagementByPost = new Map<string, { views: number; completed: number; shares: number }>();
  for (const item of engagement) {
    const current = engagementByPost.get(item.postId) ?? {
      views: 0,
      completed: 0,
      shares: 0,
    };
    if (item.type === "VIEW") current.views = item._count._all;
    if (item.type === "READ_COMPLETE") current.completed = item._count._all;
    if (item.type === "SHARE") current.shares = item._count._all;
    engagementByPost.set(item.postId, current);
  }
  const totalViews = engagement
    .filter((item) => item.type === "VIEW")
    .reduce((total, item) => total + item._count._all, 0);
  const totalCompleted = engagement
    .filter((item) => item.type === "READ_COMPLETE")
    .reduce((total, item) => total + item._count._all, 0);

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Blog"
        description="Write articles, announcements, and updates."
        action={
          canEdit ? (
            <div className="flex items-center gap-2">
              <Button asChild variant="outline">
                <Link href="/dashboard/blog/settings">
                  <Settings2 /> Halaman
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/blog/categories">
                  <Tags /> Categories
                </Link>
              </Button>
              <Button asChild>
                <Link href="/dashboard/blog/new">
                  <Plus /> New post
                </Link>
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <BlogMetric label="Total posts" value={allCount} />
        <BlogMetric label="Published" value={publishedCount} />
        <BlogMetric label="Drafts" value={draftCount} />
        <BlogMetric label="Scheduled" value={scheduledCount} />
        <BlogMetric label="Archived" value={archivedCount} />
        <BlogMetric
          label="Read completion"
          value={totalViews ? `${Math.round((totalCompleted / totalViews) * 100)}%` : "0%"}
          hint={`${totalViews} views`}
        />
      </div>

      {posts.length === 0 ? (
        <div className="space-y-4">
          <BlogFilters q={q} status={status} category={category} categories={categories} />
          <EmptyState
            icon={Newspaper}
            title={allCount === 0 ? "No posts yet" : "No matching posts"}
            description={
              allCount === 0
                ? "Publish your first article to share updates with your audience."
                : "Try changing the search or filters."
            }
            action={
              canEdit && allCount === 0 ? (
                <Button asChild>
                  <Link href="/dashboard/blog/new">
                    <Plus /> Write a post
                  </Link>
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <Card>
          <div className="border-b border-zinc-100 p-4">
            <BlogFilters q={q} status={status} category={category} categories={categories} />
          </div>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Post</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Read</TableHead>
                  <TableHead>Engagement</TableHead>
                  <TableHead>Updated</TableHead>
                  {canEdit && (
                    <TableHead className="w-12 pr-4 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell className="pl-4">
                      <Link
                        href={`/dashboard/blog/${post.id}/edit`}
                        className="text-sm font-medium text-zinc-900 hover:underline"
                      >
                        {post.title}
                      </Link>
                      {post.excerpt ? (
                        <p className="mt-1 line-clamp-1 max-w-lg text-xs text-zinc-500">
                          {post.excerpt}
                        </p>
                      ) : null}
                      {post.author?.name ? (
                        <p className="truncate text-xs text-zinc-500">
                          by {post.author.name}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[post.status]}>
                        {post.status.charAt(0) +
                          post.status.slice(1).toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-zinc-500">
                      {post.category?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-zinc-500">
                      {post._count.tags}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {readMinutes(post.body)} min
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {formatEngagement(engagementByPost.get(post.id))}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {formatDate(post.updatedAt)}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="pr-4 text-right">
                        <PostRowActions
                          postId={post.id}
                          postTitle={post.title}
                          publishedSlug={post.publishedSlug}
                          workspaceSlug={workspace.slug}
                          status={post.status}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              page={page}
              total={matchingPosts}
              pageSize={PAGE_SIZE}
              basePath="/dashboard/blog"
              params={{ q: q || undefined, status: status || undefined, category: category || undefined }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BlogMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500">
          <FileText className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs text-zinc-500">{label}</p>
          <p className="text-lg font-semibold text-zinc-900">{value}</p>
          {hint ? <p className="text-[11px] text-zinc-400">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function BlogFilters({
  q,
  status,
  category,
  categories,
}: {
  q: string;
  status: string;
  category: string;
  categories: { id: string; name: string; slug: string; _count: { posts: number } }[];
}) {
  return (
    <form className="grid gap-2 sm:grid-cols-[1fr_150px_190px_auto]">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          name="q"
          defaultValue={q}
          placeholder="Search posts..."
          className="h-9 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-zinc-100"
        />
      </div>
      <select
        name="status"
        defaultValue={status}
        className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-100"
      >
        <option value="">All status</option>
        <option value="PUBLISHED">Published</option>
        <option value="SCHEDULED">Scheduled</option>
        <option value="DRAFT">Draft</option>
        <option value="ARCHIVED">Archived</option>
      </select>
      <select
        name="category"
        defaultValue={category}
        className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-100"
      >
        <option value="">All categories</option>
        {categories.map((item) => (
          <option key={item.id} value={item.slug}>
            {item.name} ({item._count.posts})
          </option>
        ))}
      </select>
      <Button type="submit" variant="outline" size="sm">
        Filter
      </Button>
    </form>
  );
}

function formatEngagement(value?: { views: number; completed: number; shares: number }) {
  if (!value?.views) return "0 views";
  const completion = Math.round((value.completed / value.views) * 100);
  return `${value.views} views · ${completion}% read · ${value.shares} shares`;
}

function readMinutes(body: string) {
  const words = stripRichText(body).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}
