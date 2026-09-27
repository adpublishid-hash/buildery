import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { StorefrontSettingsCards } from "@/components/storefront/storefront-settings-cards";

export const metadata = { title: "Halaman produk · My Landing" };

export default async function ProductPagesSettings() {
  const { workspace, role } = await requireCurrentWorkspace();
  const canEdit = canInWorkspace(role, "content.edit");

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader
        title="Halaman produk"
        description="Atur teks halaman katalog dan detail produk publik."
        action={
          <Button variant="outline" asChild>
            <Link href="/dashboard/products">
              <ArrowLeft /> Products
            </Link>
          </Button>
        }
      />
      <StorefrontSettingsCards
        workspaceId={workspace.id}
        canEdit={canEdit}
        pageKeys={["products_catalog", "products_single"]}
      />
    </div>
  );
}
