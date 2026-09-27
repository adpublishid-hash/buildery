import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { StorefrontSettingsCards } from "@/components/storefront/storefront-settings-cards";

export const metadata = { title: "Halaman membership · My Landing" };

export default async function MembershipPagesSettings() {
  const { workspace, role } = await requireCurrentWorkspace();
  const canEdit = canInWorkspace(role, "content.edit");

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader
        title="Halaman membership"
        description="Atur teks halaman daftar membership publik. (Membership tidak punya halaman detail terpisah.)"
        action={
          <Button variant="outline" asChild>
            <Link href="/dashboard/membership">
              <ArrowLeft /> Membership
            </Link>
          </Button>
        }
      />
      <StorefrontSettingsCards
        workspaceId={workspace.id}
        canEdit={canEdit}
        pageKeys={["memberships_catalog"]}
      />
    </div>
  );
}
