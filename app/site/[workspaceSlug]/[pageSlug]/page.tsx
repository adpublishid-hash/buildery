import type { Metadata } from "next";

import {
  loadViewablePage,
  publicPageMetadata,
  resolvePublicPage,
} from "@/lib/public-page";
import { PublicPageView } from "@/components/site/public-page-view";

export const dynamic = "force-dynamic";

type Params = { workspaceSlug: string; pageSlug: string };

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const resolved = await resolvePublicPage(
    params.workspaceSlug,
    params.pageSlug
  );
  return publicPageMetadata(resolved);
}

export default async function PublicPage({ params }: { params: Params }) {
  const { resolved, isPreview } = await loadViewablePage(
    params.workspaceSlug,
    params.pageSlug
  );
  return <PublicPageView resolved={resolved} isPreview={isPreview} />;
}
