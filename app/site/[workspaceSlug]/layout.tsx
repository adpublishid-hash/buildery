import { Suspense } from "react";
import Script from "next/script";
import { cookies } from "next/headers";
import type { Metadata } from "next";

import { buildPixelIdentity, isSafePixelIdentity } from "@/lib/ad-identity";
import { CONSENT_COOKIE, VISITOR_COOKIE, readConsent } from "@/lib/analytics-visitor";
import { getMemberSession } from "@/lib/member-auth";
import { CookieConsentBanner } from "@/components/site/cookie-consent-banner";
import { getIntegrationByWorkspaceSlug } from "@/lib/integrations";
import { getStoreWorkspace } from "@/lib/store";
import { getCartSnapshotAction } from "@/lib/actions/cart";
import { publicSiteContextHref } from "@/lib/public-url-server";
import { prisma } from "@/lib/prisma";
import { TrackingScripts } from "@/components/site/tracking-scripts";
import { SitePageViewTracker } from "@/components/site/site-page-view-tracker";
import { StoreFooter } from "@/components/store/store-footer";
import { parseSiteChrome } from "@/lib/site-chrome";
import { CartDrawerProvider } from "@/components/store/cart-drawer";
import { SalesNotification } from "@/components/store/sales-notification";
import { getSalesNotificationsForWorkspace } from "@/lib/sales-notifications";

/**
 * Public-site wrapper: exposes the workspace's Search Console
 * verification meta tag and injects its tracking scripts. Runs on every
 * page under /site/[workspaceSlug] but not in the dashboard.
 */
export async function generateMetadata({
  params,
}: {
  params: { workspaceSlug: string };
}): Promise<Metadata> {
  const integration = await getIntegrationByWorkspaceSlug(params.workspaceSlug);
  if (!integration?.googleSearchConsoleVerification) return {};
  return {
    verification: { google: integration.googleSearchConsoleVerification },
  };
}

export default async function PublicSiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { workspaceSlug: string };
}) {
  const [integration, workspace] = await Promise.all([
    getIntegrationByWorkspaceSlug(params.workspaceSlug),
    getStoreWorkspace(params.workspaceSlug),
  ]);
  const [storefront, website] = workspace
    ? await Promise.all([
        prisma.storefrontSetting.findUnique({
          where: { workspaceId: workspace.id },
        }),
        // Footer situs dipakai juga di halaman toko, supaya bagian bawah
        // setiap halaman — landing maupun produk — tampil seragam.
        prisma.website.findFirst({
          where: { workspaceId: workspace.id },
          orderBy: { createdAt: "asc" },
          select: { siteFooter: true },
        }),
      ])
    : [null, null];
  const siteFooter = website ? parseSiteChrome(website).footer : null;

  // Web chat from the integration catalog: its bubble appears on every page
  // of the store while the connection is switched on.
  const webchat = workspace
    ? await prisma.integrationConnection.findFirst({
        where: { workspaceId: workspace.id, provider: "webchat", enabled: true },
        select: { webhookKey: true },
      })
    : null;

  // Only queried when the popup is switched on, so a store that does not use
  // it pays nothing for it.
  const salesNotifications =
    workspace && storefront?.salesNotificationEnabled
      ? await getSalesNotificationsForWorkspace(workspace.id, workspace.slug)
      : [];

  // Pre-resolve URLs in the current routing context (subdomain vs main domain
  // path-based) so the client drawer doesn't need to call server helpers.
  const cartHref = workspace
    ? publicSiteContextHref(workspace.slug, "cart")
    : "#";
  const checkoutHref = workspace
    ? publicSiteContextHref(workspace.slug, "checkout")
    : "#";
  const productsHref = workspace
    ? publicSiteContextHref(workspace.slug, "products")
    : "#";
  const productHrefPrefix = productsHref.endsWith("/")
    ? productsHref.slice(0, -1)
    : productsHref;
  const initialSnapshot = workspace
    ? await getCartSnapshotAction(workspace.id)
    : { lines: [], subtotal: 0, count: 0 };

  // With consent required, no ad or analytics tag loads until the visitor
  // accepts. The same cookie gates the server-side copies (lib/ad-events.ts).
  const jar = cookies();
  const consent = readConsent(jar.get(CONSENT_COOKIE)?.value);
  const consentRequired = Boolean(integration?.adConsentRequired);
  const trackingAllowed = !consentRequired || consent === "granted";
  const extraPixels = integration?.extraPixels ?? [];
  const metaPixelIds = [
    integration?.metaPixelId,
    ...extraPixels.filter((pixel) => pixel.provider === "META").map((pixel) => pixel.pixelId),
  ].filter((id): id is string => Boolean(id));
  const tiktokPixelIds = [
    integration?.tiktokPixelId,
    ...extraPixels.filter((pixel) => pixel.provider === "TIKTOK").map((pixel) => pixel.pixelId),
  ].filter((id): id is string => Boolean(id));
  const hasAdTags = Boolean(
    metaPixelIds.length > 0 ||
      tiktokPixelIds.length > 0 ||
      integration?.googleAnalyticsId ||
      integration?.googleTagManagerId ||
      integration?.googleAdsConversionId
  );

  // Advanced matching: the signed-in member, or else the anonymous visitor id
  // the server events use too. Hashed here; raw values never reach the page.
  const member =
    workspace && trackingAllowed && hasAdTags ? await getMemberSession(workspace.slug) : null;
  const identityCandidate =
    workspace && trackingAllowed && hasAdTags
      ? buildPixelIdentity({
          email: member?.email,
          phone: member?.phone,
          externalId: member?.customerId ?? jar.get(VISITOR_COOKIE)?.value ?? null,
        })
      : null;
  const identity =
    identityCandidate && isSafePixelIdentity(identityCandidate) ? identityCandidate : null;

  const content = (
    <>
      {children}
      {workspace ? (
        <StoreFooter
          workspaceName={workspace.name}
          setting={storefront}
          siteFooter={siteFooter}
        />
      ) : null}
      {workspace && storefront?.salesNotificationEnabled ? (
        <SalesNotification
          items={salesNotifications}
          template={storefront.salesNotificationText}
        />
      ) : null}
      {webchat ? (
        <Script
          id="webchat-widget"
          src={`/api/integrations/webchat/${webchat.webhookKey}/widget.js`}
          strategy="lazyOnload"
        />
      ) : null}
      {workspace ? (
        <Suspense fallback={null}>
          <SitePageViewTracker
            workspaceId={workspace.id}
            trackingAllowed={trackingAllowed}
            sendServerAdEvents={Boolean(
              (integration?.metaPixelId && integration.metaCapiEnabled) ||
                extraPixels.some((pixel) => pixel.provider === "META" && pixel.serverEnabled)
            )}
          />
        </Suspense>
      ) : null}
      {integration ? (
        <TrackingScripts
          metaPixelIds={metaPixelIds}
          tiktokPixelIds={tiktokPixelIds}
          googleAnalyticsId={integration.googleAnalyticsId}
          googleTagManagerId={integration.googleTagManagerId}
          googleAdsConversionId={integration.googleAdsConversionId}
          googleAdsPurchaseLabel={integration.googleAdsPurchaseLabel}
          customHeadScript={integration.customHeadScript}
          identity={identity}
          trackingAllowed={trackingAllowed}
        />
      ) : null}
      {workspace && consentRequired && hasAdTags && !consent ? (
        <CookieConsentBanner storeName={workspace.name} />
      ) : null}
    </>
  );

  if (!workspace) return content;
  return (
    <CartDrawerProvider
      workspaceId={workspace.id}
      workspaceSlug={workspace.slug}
      cartHref={cartHref}
      checkoutHref={checkoutHref}
      productsHref={productsHref}
      productHrefPrefix={productHrefPrefix}
      initial={initialSnapshot}
    >
      {content}
    </CartDrawerProvider>
  );
}
