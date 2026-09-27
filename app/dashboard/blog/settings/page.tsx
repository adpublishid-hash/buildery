import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { StorefrontSettingsCards } from "@/components/storefront/storefront-settings-cards";

export const metadata = { title: "Halaman blog · My Landing" };

export default async function BlogPagesSettings() {
  const { workspace, role } = await requireCurrentWorkspace();
  const canEdit = canInWorkspace(role, "content.edit");

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader
        title="Halaman blog"
        description="Atur teks halaman daftar blog dan halaman artikel publik."
        action={
          <Button variant="outline" asChild>
            <Link href="/dashboard/blog">
              <ArrowLeft /> Blog
            </Link>
          </Button>
        }
      />
      <StorefrontSettingsCards
        workspaceId={workspace.id}
        canEdit={canEdit}
        pageKeys={["blog_catalog", "blog_single"]}
      />
    </div>
  );
}
