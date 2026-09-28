import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye, Megaphone, SlidersHorizontal } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { ensureAffiliateProgram } from "@/lib/actions/affiliate";
import { getAffiliateNavCounts } from "@/lib/affiliate-overview";
import { publicSiteHref } from "@/lib/public-url";
import { Button } from "@/components/ui/button";
import { EditorSection } from "@/components/dashboard/editor-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { AffiliateNav } from "@/components/affiliate/affiliate-nav";
import { ProgramForm } from "@/components/affiliate/program-form";
import { AffiliateCreativeManager } from "@/components/affiliate/affiliate-creative-manager";

export const metadata = { title: "Affiliate program · My Landing" };

export default async function AffiliateProgramPage() {
  const { workspace, role } = await requireCurrentWorkspace();
  if (!canInWorkspace(role, "affiliate.manage")) redirect("/dashboard/affiliate");

  const program = await ensureAffiliateProgram(workspace.id);
  const [creatives, navCounts] = await Promise.all([
    prisma.affiliateCreative.findMany({
      where: { programId: program.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    getAffiliateNavCounts(workspace.id),
  ]);

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Affiliate"
        description="Program settings used by every affiliate in this workspace."
        action={
          <Button asChild variant="outline">
            <Link href={publicSiteHref(workspace.slug, "affiliates")} target="_blank">
              <Eye /> Application page
            </Link>
          </Button>
        }
      />
      <AffiliateNav {...navCounts} />

      <div className="kv-editor flex flex-col gap-[12px]">
      <EditorSection
        id="rules"
        icon={SlidersHorizontal}
        title="Program rules"
        description="Applies to every affiliate in this workspace. Commission is calculated from the order total at the time of sale."
      >
          <ProgramForm
            defaultValues={{
              name: program.name,
              description: program.description ?? "",
              commissionPercent: String(program.commissionPercent),
              isOpen: program.isOpen ? "true" : "false",
              approvalMode: program.approvalMode,
              attributionModel: program.attributionModel,
              attributionDays: String(program.attributionDays),
              holdDays: String(program.holdDays),
              minimumPayout: String(program.minimumPayout),
              allowSelfReferral: program.allowSelfReferral,
              includeShipping: program.includeShipping,
              includeTax: program.includeTax,
              includeFees: program.includeFees,
              terms: program.terms ?? "",
            }}
          />
      </EditorSection>
      <EditorSection
        id="materials"
        icon={Megaphone}
        title="Campaign materials"
        description="Ready-to-use links, images, and copy shown in the affiliate portal."
      >
        <AffiliateCreativeManager creatives={creatives} />
      </EditorSection>
      </div>
    </div>
  );
}
