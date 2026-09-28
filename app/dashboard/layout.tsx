import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getCurrentWorkspace, listMyWorkspaces } from "@/lib/workspace";
import { countUnreadConversations } from "@/lib/inbox";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { DashboardShell } from "@/components/dashboard/shell";
import { OrderNotifications } from "@/components/dashboard/order-notifications";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { PageTransition } from "@/components/ui/page-transition";
import type { WorkspaceOption } from "@/components/dashboard/workspace-switcher";

// The whole dashboard is per-user / per-workspace live data — always
// rendered per request, never statically prerendered at build time.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard");

  // Email-verification gate is handled by middleware (it can issue a real
  // 307 before this RSC layout runs). No workspace yet → the overview page
  // shows a friendly onboarding card linking to /onboarding.
  const [memberships, current] = await Promise.all([
    listMyWorkspaces(session.user.id),
    getCurrentWorkspace(session.user.id),
  ]);

  // An inbound WhatsApp message arrives through a webhook, so without a badge
  // here it is invisible from every page but the inbox itself.
  const [unreadInbox, pendingAffiliates] = current
    ? await Promise.all([
        countUnreadConversations(current.workspace.id),
        // Applications sit unseen otherwise: nothing else tells the owner.
        prisma.affiliate.count({ where: { workspaceId: current.workspace.id, status: "PENDING" } }),
      ])
    : [0, 0];
  const navBadges = {
    "/dashboard/inbox": unreadInbox,
    "/dashboard/affiliate": pendingAffiliates,
  };

  const workspaceOptions: WorkspaceOption[] = memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    logoUrl: m.workspace.logoUrl,
    role: m.role,
    status: m.workspace.status,
    isFavorite: m.isFavorite,
  }));

  return (
    <>
      <DashboardShell
        sidebar={
          <Sidebar
            role={session.user.role}
            workspaces={workspaceOptions}
            currentWorkspace={current?.workspace ?? null}
            currentMemberRole={current?.role}
            userName={session.user.name}
            userEmail={session.user.email}
            userImage={session.user.image}
            badges={navBadges}
          />
        }
        header={
          <Topbar
            notifications={<OrderNotifications workspaceId={current?.workspace.id} />}
          />
        }
      >
        <PageTransition>{children}</PageTransition>
      </DashboardShell>
      <CommandPalette role={session.user.role} />
    </>
  );
}
