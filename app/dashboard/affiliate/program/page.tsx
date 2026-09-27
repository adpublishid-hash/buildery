import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { ensureAffiliateProgram } from "@/lib/actions/affiliate";
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
  const creatives = await prisma.affiliateCreative.findMany({
    where: { programId: program.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Affiliate"
        description="Program settings used by every affiliate in this workspace."
      />
      <AffiliateNav />

      <div className="kv-editor flex flex-col gap-[12px]">
      <EditorSection title="Pengaturan program" description="Berlaku untuk setiap afiliasi di workspace ini. Komisi dihitung dari total order saat terjadi penjualan.">
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
      <EditorSection title="Materi kampanye" description="Tautan, gambar, dan teks siap pakai yang tampil di portal afiliasi.">
        <AffiliateCreativeManager creatives={creatives} />
      </EditorSection>
      </div>
    </div>
  );
}
