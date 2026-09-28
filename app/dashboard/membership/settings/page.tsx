import Link from "next/link";
import { Eye } from "lucide-react";

import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { publicSiteHref } from "@/lib/public-url";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { MembershipNav } from "@/components/membership/membership-nav";
import { StorefrontSettingsCards } from "@/components/storefront/storefront-settings-cards";

export const metadata = { title: "Membership page · My Landing" };

export default async function MembershipPagesSettings() {
  const { workspace, role } = await requireCurrentWorkspace();
  const canEdit = canInWorkspace(role, "content.edit");
  const now = new Date();
  const expiringSoon = await prisma.customerMembership.count({
    where: {
      workspaceId: workspace.id,
      status: "ACTIVE",
      expiresAt: { gt: now, lte: new Date(now.getTime() + 14 * 86_400_000) },
    },
  });

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Membership"
        description="Edit the copy on your public membership page. Plans are listed there automatically; there's no separate page per plan."
        action={
          <Button variant="outline" asChild>
            <Link href={publicSiteHref(workspace.slug, "memberships")} target="_blank">
              <Eye /> Public page
            </Link>
          </Button>
        }
      />
      <MembershipNav expiringSoon={expiringSoon} />
      <StorefrontSettingsCards
        workspaceId={workspace.id}
        canEdit={canEdit}
        pageKeys={["memberships_catalog"]}
      />
    </div>
  );
}
