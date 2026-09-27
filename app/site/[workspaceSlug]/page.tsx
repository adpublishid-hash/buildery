import type { Metadata } from "next";

import {
  loadViewablePage,
  publicPageMetadata,
  resolvePublicPage,
} from "@/lib/public-page";
import { PublicPageView } from "@/components/site/public-page-view";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { workspaceSlug: string };
}): Promise<Metadata> {
  const resolved = await resolvePublicPage(params.workspaceSlug);
  return publicPageMetadata(resolved);
}

export default async function WorkspaceHomePage({
  params,
}: {
  params: { workspaceSlug: string };
}) {
  const { resolved, isPreview } = await loadViewablePage(params.workspaceSlug);
  return <PublicPageView resolved={resolved} isPreview={isPreview} />;
}
