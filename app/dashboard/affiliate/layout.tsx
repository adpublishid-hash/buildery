import { requireCurrentWorkspace } from "@/lib/workspace";
import { getUserPlan } from "@/lib/saas-limits";
import { PageHeader } from "@/components/dashboard/page-header";
import { UpgradeRequired } from "@/components/billing/upgrade-required";
import { canInWorkspace } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function AffiliateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { workspace, role } = await requireCurrentWorkspace();
  if (!canInWorkspace(role, "affiliate.view")) redirect("/dashboard");
  const plan = await getUserPlan(workspace.createdById);
  if (!plan.hasAffiliate) {
    return (
      <div className="w-full min-w-0">
        <PageHeader
          title="Affiliate"
          description="Run a referral program with commissions and tracking links."
        />
        <UpgradeRequired
          feature="The affiliate program"
          currentPlan={plan.name}
          description={`The ${plan.name} plan doesn't include affiliate tracking. Upgrade to invite affiliates and track commissions.`}
        />
      </div>
    );
  }
  return <>{children}</>;
}
