import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { getStoreWorkspace } from "@/lib/store";
import { getMemberSession } from "@/lib/member-auth";
import { publicSiteContextHref } from "@/lib/public-url-server";
import { MemberAuthForm } from "@/components/member/member-auth-form";
import { StoreHeader } from "@/components/store/store-header";
import { safeCallbackUrl } from "@/lib/safe-redirect";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Member login" },
};

export default async function MemberLoginPage({
  params,
  searchParams,
}: {
  params: { workspaceSlug: string };
  searchParams?: { callbackUrl?: string };
}) {
  const workspace = await getStoreWorkspace(params.workspaceSlug);
  if (!workspace) notFound();

  const session = await getMemberSession(workspace.slug);
  const fallback = publicSiteContextHref(workspace.slug, "member/account");
  const callbackUrl = safeCallbackUrl(searchParams?.callbackUrl, fallback);
  if (session) redirect(callbackUrl);

  return (
    <div className="min-h-screen bg-white">
      <StoreHeader
        workspaceSlug={workspace.slug}
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        logoUrl={workspace.logoUrl}
      />
      <main className="mx-auto max-w-md px-6 py-10">
        <Link
          href={publicSiteContextHref(workspace.slug, "memberships")}
          className="mb-5 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to memberships
        </Link>
        <MemberAuthForm
          mode="login"
          workspaceSlug={workspace.slug}
          workspaceName={workspace.name}
          callbackUrl={callbackUrl}
        />
      </main>
    </div>
  );
}
