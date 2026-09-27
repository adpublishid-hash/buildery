import Script from "next/script";

import type { PixelIdentity } from "@/lib/ad-identity";

type Props = {
  /** Primary pixel first, then the extra ones; all get every event. */
  metaPixelIds: string[];
  tiktokPixelIds: string[];
  googleAnalyticsId: string | null;
  googleTagManagerId: string | null;
  googleAdsConversionId: string | null;
  googleAdsPurchaseLabel: string | null;
  customHeadScript: string | null;
  /** Hashed visitor identity for advanced matching; hex digests only. */
  identity: PixelIdentity | null;
  /**
   * False while the store requires cookie consent and the visitor has not
   * accepted: no Meta, TikTok or Google script loads at all.
   */
  trackingAllowed: boolean;
};

/**
 * Injects analytics + custom tracking scripts on public site pages.
 * Server component — runs only inside the /site/[workspaceSlug] subtree.
 *
 * Scripts are loaded with `afterInteractive` so they don't block the
 * initial paint. The custom snippet is sanitised before reaching this
 * component (no `</script>`, ≤ 2000 chars).
 *
 * These snippets only initialise the tags. Every page view — GA4, Meta and
 * TikTok alike — is sent by SitePageViewTracker in the layout, on load and on
 * each client-side navigation, which is why GA4 is configured with
 * `send_page_view: false`.
 *
 * Every id is re-validated here before being inlined into a script.
 */
const META_PIXEL_ID = /^\d{6,30}$/;
const TIKTOK_PIXEL_ID = /^[A-Z0-9]{10,40}$/i;
const GA4_ID = /^G-[A-Z0-9]{4,12}$/;
const GTM_ID = /^GTM-[A-Z0-9]{4,10}$/;
const GOOGLE_ADS_ID = /^AW-\d{6,15}$/;
const GOOGLE_ADS_LABEL = /^[\w-]{1,100}$/;

export function TrackingScripts({
  metaPixelIds,
  tiktokPixelIds,
  googleAnalyticsId,
  googleTagManagerId,
  googleAdsConversionId,
  googleAdsPurchaseLabel,
  customHeadScript,
  identity,
  trackingAllowed,
}: Props) {
  const metaIds = validIds(metaPixelIds, META_PIXEL_ID);
  const tiktokIds = validIds(tiktokPixelIds, TIKTOK_PIXEL_ID);
  const meta = metaIds.length > 0;
  const tiktok = tiktokIds.length > 0;
  const ga4 = googleAnalyticsId && GA4_ID.test(googleAnalyticsId) ? googleAnalyticsId : null;
  const gtm = googleTagManagerId && GTM_ID.test(googleTagManagerId) ? googleTagManagerId : null;
  const ads =
    googleAdsConversionId && GOOGLE_ADS_ID.test(googleAdsConversionId)
      ? googleAdsConversionId
      : null;
  const adsSendTo =
    ads && googleAdsPurchaseLabel && GOOGLE_ADS_LABEL.test(googleAdsPurchaseLabel)
      ? `${ads}/${googleAdsPurchaseLabel}`
      : null;
  // One gtag.js serves both GA4 and Google Ads.
  const gtagId = ga4 ?? ads;

  // The layout passes only hex digests (isSafePixelIdentity), so JSON is safe
  // to inline.
  const asJson = (group: Record<string, string> | undefined) =>
    group && Object.keys(group).length > 0 ? JSON.stringify(group) : null;
  const metaUserData = asJson(identity?.meta);
  const tiktokIdentity = asJson(identity?.tiktok);
  const googleUserData = asJson(identity?.google);

  return (
    <>
      {trackingAllowed && gtm ? (
        <Script id="bd-gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtm}');`}
        </Script>
      ) : null}

      {trackingAllowed && gtagId ? (
        <>
          <Script
            id="bd-ga-src"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${gtagId}`}
          />
          <Script id="bd-ga-init" strategy="afterInteractive">
            {[
              "window.dataLayer = window.dataLayer || [];",
              "window.gtag = window.gtag || function(){window.dataLayer.push(arguments);};",
              "window.gtag('js', new Date());",
              ga4 ? `window.gtag('config', '${ga4}', { send_page_view: false });` : "",
              ads ? `window.gtag('config', '${ads}', { allow_enhanced_conversions: true });` : "",
              googleUserData ? `window.gtag('set', 'user_data', ${googleUserData});` : "",
              "window.builderyAnalytics = window.builderyAnalytics || {};",
              ga4 ? `window.builderyAnalytics.measurementId = '${ga4}';` : "",
              adsSendTo
                ? `window.builderyAnalytics.googleAdsPurchaseSendTo = '${adsSendTo}';`
                : "",
              "window.builderyAnalytics.trackEvent = function(name, params){ if (!name || !window.gtag) return; window.gtag('event', name, params || {}); };",
            ]
              .filter(Boolean)
              .join(" ")}
          </Script>
        </>
      ) : null}

      {trackingAllowed && meta ? (
        <Script id="bd-fbpx" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js'); ${metaIds.map((id) => `fbq('init', '${id}'${metaUserData ? `, ${metaUserData}` : ""});`).join(" ")}`}
        </Script>
      ) : null}

      {trackingAllowed && tiktok ? (
        <Script id="bd-ttpx" strategy="afterInteractive">
          {`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=d.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=d.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};${tiktokIds.map((id) => `ttq.load('${id}');`).join("")}${tiktokIdentity ? `ttq.identify(${tiktokIdentity});` : ""}}(window,document,'ttq');`}
        </Script>
      ) : null}

      {/* The store's own snippet (chat widgets and the like) is not gated by
          the consent banner; the settings page says so. */}
      {customHeadScript ? (
        <Script id="bd-custom" strategy="afterInteractive">
          {customHeadScript}
        </Script>
      ) : null}

      {/*
        Avoid rendering noscript fallbacks inside the hydrated React tree.
        Browsers parse noscript children differently when JavaScript is enabled,
        which can produce false hydration mismatches on public pages.
      */}
    </>
  );
}

/**
 * Every id is checked against its format before it is written into a script;
 * one listed twice (the primary added again as an extra) loads once.
 */
function validIds(ids: string[], pattern: RegExp) {
  return Array.from(new Set(ids.map((id) => id.trim()).filter((id) => pattern.test(id))));
}
