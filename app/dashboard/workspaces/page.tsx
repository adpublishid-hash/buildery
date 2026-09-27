import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, Plus } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { WorkspaceCard } from "@/components/workspaces/workspace-card";

export const metadata = { title: "Workspaces · My Landing" };

export default async function WorkspacesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [memberships, current] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { userId: session.user.id },
      include: {
        workspace: {
          include: { _count: { select: { members: true } } },
        },
      },
      orderBy: [{ isFavorite: "desc" }, { lastOpenedAt: "desc" }, { createdAt: "asc" }],
    }),
    getCurrentWorkspace(session.user.id),
  ]);

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Workspaces"
        description="Each workspace is a self-contained business: sites, products, members, and data."
        action={
          <Button asChild>
            <Link href="/dashboard/workspaces/new">
              <Plus /> New workspace
            </Link>
          </Button>
        }
      />

      {memberships.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No workspaces yet"
          description="Create your first workspace to start building. You can add as many as you need."
          action={
            <Button asChild>
              <Link href="/dashboard/workspaces/new">
                <Plus /> Create workspace
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {memberships.map((m) => (
            <WorkspaceCard
              key={m.id}
              workspace={m.workspace}
              role={m.role}
              isCurrent={m.workspace.id === current?.workspace.id}
              memberCount={m.workspace._count.members}
              isFavorite={m.isFavorite}
            />
          ))}
        </div>
      )}
    </div>
  );
}
