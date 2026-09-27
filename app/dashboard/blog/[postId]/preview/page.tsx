import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock3 } from "lucide-react";

import { PostContent } from "@/components/blog/post-content";
import { Badge } from "@/components/ui/badge";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { renderPostBody } from "@/lib/blog-toc";
import { sanitizeRichHtml } from "@/lib/rich-html";
import { stripRichText } from "@/lib/rich-text";
import { requireCurrentWorkspace } from "@/lib/workspace";

export const metadata = { title: "Post preview · My Landing" };

export default async function BlogPostPreviewPage({
  params,
}: {
  params: { postId: string };
}) {
  const { workspace, role } = await requireCurrentWorkspace();
  if (!canInWorkspace(role, "content.edit")) redirect("/dashboard/blog");
  const post = await prisma.blogPost.findUnique({
    where: { id: params.postId },
    include: {
      image: { select: { url: true } },
      category: { select: { name: true } },
      author: { select: { name: true } },
    },
  });
  if (!post || post.workspaceId !== workspace.id) notFound();

  const html = renderPostBody(sanitizeRichHtml(post.body)).html;
  const words = stripRichText(post.body).split(/\s+/).filter(Boolean).length;

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <article className="mx-auto w-full max-w-3xl">
        <div className="mb-8 flex items-center justify-between gap-4 border-b border-zinc-200 pb-4">
          <Link
            href={`/dashboard/blog/${post.id}/edit`}
            className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900"
          >
            <ArrowLeft className="h-4 w-4" /> Back to editor
          </Link>
          <Badge variant="outline">Private draft preview</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
          {post.category ? <Badge variant="secondary">{post.category.name}</Badge> : null}
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" /> Draft
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock3 className="h-3.5 w-3.5" />
            {Math.max(1, Math.ceil(words / 220))} min read
          </span>
        </div>

        <h1 className="mt-5 text-4xl font-semibold text-zinc-950 sm:text-5xl">
          {post.title || "Untitled post"}
        </h1>
        {post.excerpt ? (
          <p className="mt-5 text-lg leading-relaxed text-zinc-600">{post.excerpt}</p>
        ) : null}
        <p className="mt-5 text-sm text-zinc-500">
          {post.author?.name ?? "Unknown author"}
        </p>

        {post.image?.url ? (
          <figure className="mt-8 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.image.url}
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
      </article>
    </main>
  );
}
