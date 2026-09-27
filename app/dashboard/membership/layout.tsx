import { UpgradeRequired } from "@/components/billing/upgrade-required";
import { PageHeader } from "@/components/dashboard/page-header";
import { canInWorkspace } from "@/lib/permissions";
import { getUserPlan } from "@/lib/saas-limits";
import { requireCurrentWorkspace } from "@/lib/workspace";

export default async function MembershipLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { workspace, role } = await requireCurrentWorkspace();
  if (!canInWorkspace(role, "membership.view")) {
    return (
      <div className="w-full min-w-0">
        <PageHeader
          title="Membership"
          description="Membership data is available to workspace owners and admins."
        />
        <UpgradeRequired
          feature="Membership administration"
          currentPlan="Workspace role"
          description="Ask a workspace owner to grant you an Admin role."
        />
      </div>
    );
  }
  const plan = await getUserPlan(workspace.createdById);
  if (!plan.hasMembership) {
    return (
      <div className="w-full min-w-0">
        <PageHeader
          title="Membership"
          description="Sell timed access and manage member entitlements."
        />
        <UpgradeRequired
          feature="Membership"
          currentPlan={plan.name}
          description={`The ${plan.name} plan doesn't include membership management.`}
        />
      </div>
    );
  }
  return <>{children}</>;
}
