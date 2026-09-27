import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BadgePercent, Link2, MousePointerClick, WalletCards } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { getUserPlan } from "@/lib/saas-limits";
import { publicSiteContextHref } from "@/lib/public-url-server";
import { getStoreWorkspace } from "@/lib/store";
import { StoreHeader } from "@/components/store/store-header";
import { PublicAffiliateForm } from "@/components/affiliate/public-affiliate-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { workspaceSlug: string };
}): Promise<Metadata> {
  const workspace = await getStoreWorkspace(params.workspaceSlug);
  if (!workspace) return { title: "Affiliate" };
  return {
    title: { absolute: `Affiliate - ${workspace.name}` },
    description: `Join the ${workspace.name} affiliate program.`,
  };
}

export default async function PublicAffiliatePage({
  params,
}: {
  params: { workspaceSlug: string };
}) {
  const workspace = await getStoreWorkspace(params.workspaceSlug);
  if (!workspace) notFound();

  const [program, plan] = await Promise.all([
    prisma.affiliateProgram.findUnique({ where: { workspaceId: workspace.id } }),
    getUserPlan(workspace.createdById),
  ]);
  if (!program || !plan.hasAffiliate) notFound();

  return (
    <div className="min-h-screen bg-white text-zinc-950">
      <StoreHeader
        workspaceSlug={workspace.slug}
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        logoUrl={workspace.logoUrl}
      />

      <main className="mx-auto grid max-w-5xl gap-8 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
        <section className="space-y-8">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600">
              <BadgePercent className="h-3.5 w-3.5 text-zinc-400" />
              Program affiliate
            </span>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
              Dapatkan komisi dari setiap penjualan yang kamu rekomendasikan.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600">
              Daftar sebagai affiliate {workspace.name}, bagikan referral link
              personal, lalu pantau hasilnya dari tracking otomatis workspace.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Benefit
              icon={Link2}
              title="Referral link"
              description="Link unik aktif setelah verifikasi dan persetujuan."
            />
            <Benefit
              icon={MousePointerClick}
              title="Tracking klik"
              description="Klik, lead, dan sale dicatat otomatis."
            />
            <Benefit
              icon={WalletCards}
              title={`${program.commissionPercent}% komisi`}
              description="Komisi dihitung dari transaksi yang berhasil."
            />
          </div>
        </section>

        <aside className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          {program.isOpen ? (
            <>
              <div className="mb-5">
                <p className="text-lg font-semibold text-zinc-950">
                  Join {program.name}
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  Isi data di bawah untuk membuat referral link.
                </p>
              </div>
              <PublicAffiliateForm workspaceSlug={workspace.slug} hasTerms={Boolean(program.terms)} memberRegisterUrl={publicSiteContextHref(workspace.slug, "member/register")} />
              {program.terms ? <div className="mt-5 border-t border-zinc-200 pt-4">
                <p className="text-xs font-medium text-zinc-700">Ketentuan program</p>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-zinc-500">{program.terms}</p>
              </div> : null}
            </>
          ) : (
            <div className="py-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100">
                <BadgePercent className="h-5 w-5 text-zinc-400" />
              </div>
              <p className="font-semibold text-zinc-950">
                Program sedang ditutup
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                Pendaftaran affiliate belum dibuka untuk saat ini.
              </p>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

function Benefit({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Link2;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <Icon className="mb-3 h-4 w-4 text-zinc-500" />
      <p className="text-sm font-semibold text-zinc-950">{title}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
    </div>
  );
}
