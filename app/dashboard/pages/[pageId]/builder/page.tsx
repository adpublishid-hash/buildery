import { requirePageAccess } from "@/lib/website";
import { prisma } from "@/lib/prisma";
import { parseBlockDataWithReport, type Block } from "@/lib/blocks/schema";
import { reportError } from "@/lib/error-reporting";
import { PageBuilder } from "@/components/builder/page-builder";
import { parseBuilderDesignTokens } from "@/lib/builder-design-tokens";
import {
  applySiteChrome,
  parseSiteChrome,
  siteChromeFingerprint,
} from "@/lib/site-chrome";
import { isAiConfigured } from "@/lib/ai/config";
import { getUserPlan, planHasFeature } from "@/lib/saas-limits";
import { canInWorkspace } from "@/lib/permissions";

export const metadata = { title: "Builder · My Landing" };

export default async function BuilderPage({
  params,
}: {
  params: { pageId: string };
}) {
  const { page, workspace, role } = await requirePageAccess(
    params.pageId,
    "content.edit"
  );

  // Header/footer bertanda siteWide menampilkan versi situs, supaya yang
  // diedit di sini selalu sama dengan yang tayang di semua halaman lain.
  const siteChrome = parseSiteChrome(page.website);
  let repairedBlocks = 0;
  const initialBlocks: Block[] = applySiteChrome(
    page.blocks.map((b) => {
      const parsed = parseBlockDataWithReport(b.type, b.data);
      if (parsed.repaired.length > 0) {
        repairedBlocks++;
        reportError("stored block data repaired", new Error(`${b.type} ${b.id}`), {
          context: { blockId: b.id, pageId: page.id, repaired: parsed.repaired },
          fingerprintExtra: `${b.type}:${parsed.repaired.join(",")}`,
        });
      }
      return { id: b.id, type: b.type, data: parsed.data } as Block;
    }),
    siteChrome
  );
  // Resolved here so the builder never shows a button that would fail on
  // click: the platform needs an API key AND the owner's plan must allow it.
  const plan = await getUserPlan(workspace.createdById);
  const aiEnabled = isAiConfigured() && planHasFeature(plan, "aiAssistant");

  // The page settings' Meta Pixels section says whether any pixel will
  // actually receive the event, instead of letting the owner pick one blind.
  const integration = await prisma.integrationSetting.findUnique({
    where: { workspaceId: workspace.id },
    select: { metaPixelId: true, tiktokPixelId: true, googleAnalyticsId: true },
  });
  const pixelTargets = [
    integration?.metaPixelId ? "Meta" : null,
    integration?.tiktokPixelId ? "TikTok" : null,
    integration?.googleAnalyticsId ? "Google Analytics" : null,
  ].filter((name): name is string => Boolean(name));

  const forms = await prisma.form.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      isOpen: true,
      _count: { select: { fields: true } },
    },
  });

  return (
    <div className="fixed inset-0 z-50 h-screen overflow-hidden bg-white dark:bg-zinc-950">
      <PageBuilder
        page={{
          id: page.id,
          title: page.title,
          slug: page.slug,
          status: page.status,
          seoTitle: page.seoTitle ?? "",
          metaDescription: page.metaDescription ?? "",
          ogImage: page.ogImage ?? "",
          canonicalUrl: page.canonicalUrl ?? "",
          noindex: page.noindex,
          pixelEvent: page.pixelEvent ?? "",
          customCss: page.customCss ?? "",
          editVersion: page.editVersion,
          updatedAt: page.updatedAt.toISOString(),
        }}
        initialBlocks={initialBlocks}
        repairedBlockCount={repairedBlocks}
        siteChrome={siteChrome}
        initialSiteChromeBase={{
          header: siteChromeFingerprint(siteChrome.header),
          footer: siteChromeFingerprint(siteChrome.footer),
        }}
        aiEnabled={aiEnabled}
        canEditCss={canInWorkspace(role, "branding.edit")}
        pixelTargets={pixelTargets}
        accentColor={workspace.primaryColor}
        initialDesignTokens={parseBuilderDesignTokens(
          page.website.designTokens,
          workspace.primaryColor
        )}
        formOptions={forms.map((form) => ({
          id: form.id,
          slug: form.slug,
          title: form.title,
          isOpen: form.isOpen,
          fieldCount: form._count.fields,
        }))}
      />
    </div>
  );
}
