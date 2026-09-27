import { redirect } from "next/navigation";

import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { BlogPostForm } from "@/components/blog/post-form";

export const metadata = { title: "New post · My Landing" };

export default async function NewBlogPostPage() {
  const { role } = await requireCurrentWorkspace();
  if (!canInWorkspace(role, "content.edit")) redirect("/dashboard/blog");

  return (
    <div className="w-full">
      <BlogPostForm
        mode="create"
        defaultImageUrl={null}
        defaultValues={{
          title: "",
          slug: "",
          excerpt: "",
          body: "",
          status: "DRAFT",
          category: "",
          tags: "",
          seoTitle: "",
          metaDescription: "",
          canonicalUrl: "",
          noindex: false,
          imageAlt: "",
          imageCaption: "",
          scheduledAt: "",
          featured: false,
          imageId: "",
        }}
      />
    </div>
  );
}
