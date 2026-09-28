import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CreditCard } from "lucide-react";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import type { MetaCustomData } from "@/lib/meta-capi";
import { getWorkspaceAdCurrency } from "@/lib/ad-events";
import { getStoreWorkspace } from "@/lib/store";
import { resolveContent } from "@/lib/storefront-content";
import { getPageContent } from "@/lib/storefront-content-server";
import { getMemberSession } from "@/lib/member-auth";
import { publicSiteContextHref } from "@/lib/public-url-server";
import { publicSiteUrl } from "@/lib/public-url";
import { Button } from "@/components/ui/button";
import { StoreHeader } from "@/components/store/store-header";
import { MembershipJoin } from "@/components/store/membership-join";
import { MetaEventTracker } from "@/components/site/meta-event-tracker";
import { issueMetaEventAuthorization } from "@/lib/meta-event-auth";
import { getUserPlan } from "@/lib/saas-limits";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { workspaceSlug: string };
}): Promise<Metadata> {
  const workspace = await getStoreWorkspace(params.workspaceSlug);
  if (!workspace) return { title: "Memberships" };
  return {
    title: { absolute: `Memberships · ${workspace.name}` },
    description: `Membership access passes from ${workspace.name}.`,
    alternates: { canonical: publicSiteUrl(workspace.slug, "memberships") },
  };
}

export default async function PublicMembershipsPage({
  params,
}: {
  params: { workspaceSlug: string };
}) {
  const workspace = await getStoreWorkspace(params.workspaceSlug);
  if (!workspace) notFound();

  const member = await getMemberSession(workspace.slug);
  const featureEnabled = (await getUserPlan(workspace.createdById)).hasMembership;
  const [plans, memberMemberships] = await Promise.all([
    prisma.membershipPlan.findMany({
      where: {
        workspaceId: workspace.id,
        isActive: true,
        id: featureEnabled ? undefined : "__disabled__",
      },
      orderBy: [{ recommended: "desc" }, { sortOrder: "asc" }, { price: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        level: true,
        price: true,
        accessDays: true,
        benefits: true,
        recommended: true,
        ctaLabel: true,
      },
    }),
    member
      ? prisma.customerMembership.findMany({
          where: { workspaceId: workspace.id, customerId: member.customerId },
          select: { planId: true, status: true, expiresAt: true, cancelAtPeriodEnd: true },
        })
      : Promise.resolve([]),
  ]);
  const membershipMetaData: MetaCustomData = {
    content_ids: plans.map((plan) => plan.id),
    content_name: "Memberships",
    content_type: "membership",
    content_category: "membership",
    currency: await getWorkspaceAdCurrency(workspace.id),
    value: plans[0]?.price ?? 0,
    num_items: plans.length,
  };
  const metaAuthorization = issueMetaEventAuthorization({
    workspaceId: workspace.id,
    eventName: "ViewContent",
    customData: membershipMetaData,
  });
  const content = resolveContent(
    "memberships_catalog",
    await getPageContent(workspace.id, "memberships_catalog"),
    {
      heading: "Memberships",
      subheading: `Join ${workspace.name} to unlock members-only content.`,
    }
  );
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "OfferCatalog",
    name: `${workspace.name} membership passes`,
    itemListElement: plans.map((plan) => ({
      "@type": "Offer",
      name: plan.name,
      price: plan.price,
      priceCurrency: "IDR",
      availability: "https://schema.org/InStock",
      url: publicSiteUrl(workspace.slug, "memberships"),
    })),
  };

  return (
    <div className="min-h-screen bg-white">
      <StoreHeader
        workspaceSlug={workspace.slug}
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        logoUrl={workspace.logoUrl}
      />
      <MetaEventTracker
        workspaceId={workspace.id}
        eventName="ViewContent"
        eventId={metaAuthorization.eventId}
        serverToken={metaAuthorization.token}
        dedupeKey={`memberships:${workspace.id}`}
        customData={membershipMetaData}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />

      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
              {content.heading}
            </h1>
            <p className="text-sm text-zinc-500">{content.subheading}</p>
          </div>
          {member ? (
            <Button asChild variant="outline">
              <Link href={publicSiteContextHref(workspace.slug, "member/account")}>
                Member area
              </Link>
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href={publicSiteContextHref(workspace.slug, "member/login")}>
                  Log in
                </Link>
              </Button>
              <Button asChild>
                <Link
                  href={publicSiteContextHref(workspace.slug, "member/register")}
                >
                  Sign up
                </Link>
              </Button>
            </div>
          )}
        </div>

        {plans.length === 0 ? (
          <div className="mt-12 flex flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100">
              <CreditCard className="h-6 w-6 text-zinc-400" />
            </div>
            <p className="text-sm font-medium text-zinc-900">
              No membership plans yet
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Check back soon.
            </p>
          </div>
        ) : (
          <div className="mt-8">
            <MembershipJoin
              workspaceId={workspace.id}
              workspaceSlug={workspace.slug}
              plans={plans}
              member={member}
              memberships={memberMemberships}
            />
          </div>
        )}
      </main>
    </div>
  );
}
