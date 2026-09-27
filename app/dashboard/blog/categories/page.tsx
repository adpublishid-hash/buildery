import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { Card, CardContent } from "@/components/ui/card";
import { CategoryManager } from "@/components/blog/category-manager";

export const metadata = { title: "Blog categories · My Landing" };

export default async function BlogCategoriesPage() {
  const { workspace, role } = await requireCurrentWorkspace();
  if (!canInWorkspace(role, "content.edit")) redirect("/dashboard/blog");

  const [categories, tags] = await Promise.all([
    prisma.blogCategory.findMany({
      where: { workspaceId: workspace.id },
      include: { _count: { select: { posts: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.blogTag.findMany({
      where: { workspaceId: workspace.id },
      include: { _count: { select: { posts: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="w-full min-w-0">
      <Link
        href="/dashboard/blog"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to blog
      </Link>
      <div className="space-y-1.5 pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Blog categories
        </h1>
        <p className="text-sm text-zinc-500">
          Organize categories and tags used by your published articles.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <CategoryManager
            categories={categories.map((c) => ({
              id: c.id,
              name: c.name,
              slug: c.slug,
              postCount: c._count.posts,
            }))}
            tags={tags.map((tag) => ({
              id: tag.id,
              name: tag.name,
              slug: tag.slug,
              postCount: tag._count.posts,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
