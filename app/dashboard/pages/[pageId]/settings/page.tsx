import Link from "next/link";
import { ArrowLeft, PenSquare } from "lucide-react";

import { canInWorkspace } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/website";
import { Button } from "@/components/ui/button";
import { PageSettingsForm } from "@/components/pages/page-settings-form";

export const metadata = { title: "Page settings · My Landing" };

export default async function PageSettingsPage({
  params,
}: {
  params: { pageId: string };
}) {
  const { page, role } = await requirePageAccess(
    params.pageId,
    "content.view"
  );
  const canEdit = canInWorkspace(role, "content.edit");

  return (
    <div className="w-full min-w-0">
      <Link
        href="/dashboard/pages"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to pages
      </Link>

      <div className="flex items-end justify-between gap-3 pb-6">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-zinc-400">
            Page settings
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {page.title}
          </h1>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/dashboard/pages/${page.id}/builder`}>
            <PenSquare /> Open builder
          </Link>
        </Button>
      </div>

      <PageSettingsForm
        pageId={page.id}
        canEdit={canEdit}
        isHomePage={page.website.homePageId === page.id}
        defaultValues={{
          title: page.title,
          slug: page.slug,
          status: page.status,
          seoTitle: page.seoTitle ?? "",
          metaDescription: page.metaDescription ?? "",
          ogImage: page.ogImage ?? "",
          canonicalUrl: page.canonicalUrl ?? "",
          noindex: page.noindex,
        }}
      />
    </div>
  );
}
