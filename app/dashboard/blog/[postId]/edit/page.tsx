import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { BlogPostForm } from "@/components/blog/post-form";

export const metadata = { title: "Edit post · My Landing" };

export default async function EditBlogPostPage({
  params,
}: {
  params: { postId: string };
}) {
  const { workspace, role } = await requireCurrentWorkspace();
  if (!canInWorkspace(role, "content.edit")) redirect("/dashboard/blog");

  const post = await prisma.blogPost.findUnique({
    where: { id: params.postId },
    include: {
      image: true,
      category: { select: { name: true } },
      tags: { select: { name: true } },
      versions: {
        select: { version: true, title: true, createdAt: true },
        orderBy: { version: "desc" },
        take: 10,
      },
    },
  });
  if (!post || post.workspaceId !== workspace.id) notFound();

  return (
    <div className="w-full">
      <BlogPostForm
        mode="edit"
        postId={post.id}
        defaultImageUrl={post.image?.url ?? null}
        publishedVersion={post.publishedVersion}
        versions={post.versions.map((version) => ({
          ...version,
          createdAt: version.createdAt.toISOString(),
        }))}
        defaultValues={{
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt ?? "",
          body: post.body,
          status: post.status,
          category: post.category?.name ?? "",
          tags: post.tags.map((t) => t.name).join(", "),
          seoTitle: post.seoTitle ?? "",
          metaDescription: post.metaDescription ?? "",
          canonicalUrl: post.canonicalUrl ?? "",
          noindex: post.noindex,
          imageAlt: post.imageAlt ?? "",
          imageCaption: post.imageCaption ?? "",
          scheduledAt: post.scheduledAt?.toISOString() ?? "",
          featured: Boolean(post.featuredAt),
          imageId: post.imageId ?? "",
        }}
      />
    </div>
  );
}
