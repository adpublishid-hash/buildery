import type { ResolvedPublicPage } from "@/lib/public-page";
import { PublicBlockRenderer } from "@/components/blocks/public-block-renderer";

import { PageIdBeacon } from "./page-id-beacon";
import { PreviewBanner } from "./preview-banner";
import { parseBuilderDesignTokens } from "@/lib/builder-design-tokens";
import { PageStructuredData } from "./page-structured-data";
import { MetaEventTracker } from "./meta-event-tracker";
import { isPagePixelEvent } from "@/lib/page-advanced";

type Props = {
  resolved: ResolvedPublicPage;
  isPreview: boolean;
};

/** Renders a resolved public page — preview banner, blocks, and tracking. */
export function PublicPageView({ resolved, isPreview }: Props) {
  const { workspace, page, blocks } = resolved;
  const live = !isPreview && page.status === "PUBLISHED";

  return (
    <>
      {/* Page-only CSS. Saving already refuses "</style"; escaping every "<"
          here keeps a row written some other way from closing the tag. */}
      {page.customCss ? (
        <style
          data-bd-page-css=""
          dangerouslySetInnerHTML={{ __html: page.customCss.replace(/</g, "\\3C ") }}
        />
      ) : null}

      {isPreview ? (
        <PreviewBanner status={page.status} pageId={page.id} />
      ) : null}

      {/* Pratinjau tidak diindeks siapa pun, jadi tidak perlu structured data. */}
      {!isPreview && page.status === "PUBLISHED" ? (
        <PageStructuredData
          workspace={workspace}
          page={page}
          isHomePage={resolved.isHomePage}
        />
      ) : null}

      <PublicBlockRenderer
        blocks={blocks}
        accentColor={workspace.primaryColor}
        workspaceName={workspace.name}
        designTokens={parseBuilderDesignTokens(
          resolved.website.designTokens,
          workspace.primaryColor
        )}
      />

      {/* The layout records every public page view; this only says which Page
          row this one is. Previews by members are left unattributed. */}
      {live ? <PageIdBeacon pageId={page.id} /> : null}

      {/* Browser pixels only: they load after cookie consent, so the event
          follows the same gate. An unsigned client event gets no server
          copy (/api/meta/event would refuse it). */}
      {live && isPagePixelEvent(page.pixelEvent) ? (
        <MetaEventTracker
          workspaceId={workspace.id}
          eventName={page.pixelEvent}
          customData={{ content_name: page.title }}
          dedupeKey={`page:${page.id}:${page.pixelEvent}`}
          sendServer={false}
        />
      ) : null}
    </>
  );
}
