import { Plug } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { requireWorkspacePermission } from "@/lib/workspace";
import { getWorkspaceMetaCapiStatus } from "@/lib/meta-capi";
import { getWorkspaceTikTokStatus } from "@/lib/tiktok-events";
import { getWorkspaceGa4Status } from "@/lib/ga4-measurement";
import { buildCatalogFeed, catalogFeedUrl } from "@/lib/catalog-feed";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IntegrationsForm } from "@/components/settings/integrations-form";
import { IntegrationCatalog } from "@/components/integrations/integration-catalog";
import { listConnectionViews } from "@/lib/integrations/connections";
import { INTEGRATION_SECRET_FIELDS } from "@/lib/integration-secrets";
import { secretHint } from "@/lib/secret-fields";

export const metadata = { title: "Integrasi · My Landing" };

export default async function IntegrationsSettingsPage() {
  // Integrations hold the store's credentials. Only the roles that may change
  // them get to open the page at all.
  const { workspace, role } = await requireWorkspacePermission("branding.edit");
  const canEdit = canInWorkspace(role, "branding.edit");
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";
  const gmailRedirectUri = `${appUrl.replace(
    /\/+$/,
    ""
  )}/api/integrations/gmail/oauth/callback`;

  const [integration, metaCapiStatus, tiktokStatus, ga4Status, catalog, adPixels, connections, ecommerce] = await Promise.all([
    prisma.integrationSetting.findUnique({
      where: { workspaceId: workspace.id },
    }),
    getWorkspaceMetaCapiStatus(workspace.id),
    getWorkspaceTikTokStatus(workspace.id),
    getWorkspaceGa4Status(workspace.id),
    buildCatalogFeed(workspace),
    // Extra pixels for the settings list; the token is reduced to "stored or
    // not" here and never leaves the server.
    prisma.adPixel.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        provider: true,
        pixelId: true,
        label: true,
        serverEnabled: true,
        accessToken: true,
        testEventCode: true,
        isActive: true,
      },
    }),
    listConnectionViews(workspace.id),
    prisma.ecommerceSetting.findUnique({
      where: { workspaceId: workspace.id },
      select: { midtransEnabled: true, midtransServerKey: true, rajaOngkirApiKey: true },
    }),
  ]);

  // Providers configured in the older forms, shown in the catalog by status.
  const on = (value: unknown) => (value ? ("connected" as const) : ("off" as const));
  const builtIn: Record<string, "connected" | "off"> = {
    mailketing: on(integration?.mailketingEnabled && integration.mailketingApiToken),
    gmail: on(integration?.gmailOAuthEnabled && integration.gmailRefreshToken),
    midtrans: on(ecommerce?.midtransEnabled && ecommerce.midtransServerKey),
    rajaongkir: on(ecommerce?.rajaOngkirApiKey),
    meta: on(integration?.metaPixelId),
    tiktok: on(integration?.tiktokPixelId),
    google: on(integration?.googleAnalyticsId || integration?.googleTagManagerId || integration?.googleAdsConversionId),
    ...(integration?.whatsappProvider && integration.whatsappIsActive
      ? { [`whatsapp:${integration.whatsappProvider}`]: "connected" as const }
      : {}),
  };

  return (
    <div className="min-w-0 space-y-6">
      <IntegrationCatalog connections={connections} builtIn={builtIn} canEdit={canEdit} />
      <Card id="integrations-form" className="scroll-mt-20 overflow-hidden rounded-2xl border-zinc-200 shadow-sm dark:border-zinc-800">
        <CardHeader className="border-b border-zinc-100 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/30">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-200 dark:ring-zinc-800">
              <Plug className="h-4 w-4" />
            </span>
            <div>
              <CardTitle>Integrasi</CardTitle>
              <CardDescription>
                Analytics, email transactional, Telegram, custom script, dan
                WhatsApp Inbox dalam satu halaman terpisah.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <IntegrationsForm
            canEdit={canEdit}
            loadedAt={(integration?.updatedAt ?? new Date(0)).toISOString()}
            secretHints={Object.fromEntries(
              INTEGRATION_SECRET_FIELDS.map((field) => [
                field,
                secretHint(integration?.[field]),
              ])
            )}
            gmailRedirectUri={gmailRedirectUri}
            metaCapiStatus={metaCapiStatus}
            tiktokStatus={tiktokStatus}
            extraPixels={{
              META: adPixels.filter((pixel) => pixel.provider === "META").map((pixel: (typeof adPixels)[number]) => ({
                id: pixel.id,
                pixelId: pixel.pixelId,
                label: pixel.label,
                serverEnabled: pixel.serverEnabled,
                hasToken: Boolean(pixel.accessToken),
                testEventCode: pixel.testEventCode,
                isActive: pixel.isActive,
              })),
              TIKTOK: adPixels.filter((pixel) => pixel.provider === "TIKTOK").map((pixel: (typeof adPixels)[number]) => ({
                id: pixel.id,
                pixelId: pixel.pixelId,
                label: pixel.label,
                serverEnabled: pixel.serverEnabled,
                hasToken: Boolean(pixel.accessToken),
                testEventCode: pixel.testEventCode,
                isActive: pixel.isActive,
              })),
            }}
            ga4Status={ga4Status}
            catalog={{
              url: catalogFeedUrl(workspace.slug),
              items: catalog.items.length,
              skippedWithoutImage: catalog.skippedWithoutImage,
              truncated: catalog.truncated,
            }}
            defaultValues={{
              metaPixelId: integration?.metaPixelId ?? "",
              metaCapiEnabled: integration?.metaCapiEnabled ?? false,
              metaCapiAccessToken: "",
              metaCapiTestEventCode:
                integration?.metaCapiTestEventCode ?? "",
              tiktokPixelId: integration?.tiktokPixelId ?? "",
              tiktokEventsApiEnabled:
                integration?.tiktokEventsApiEnabled ?? false,
              tiktokAccessToken: "",
              tiktokTestEventCode: integration?.tiktokTestEventCode ?? "",
              googleAnalyticsApiSecret: "",
              googleAdsConversionId: integration?.googleAdsConversionId ?? "",
              googleAdsPurchaseLabel: integration?.googleAdsPurchaseLabel ?? "",
              adConsentRequired: integration?.adConsentRequired ?? false,
              googleAnalyticsId: integration?.googleAnalyticsId ?? "",
              googleTagManagerId: integration?.googleTagManagerId ?? "",
              googleSearchConsoleVerification:
                integration?.googleSearchConsoleVerification ?? "",
              customHeadScript: integration?.customHeadScript ?? "",
              mailketingEnabled: integration?.mailketingEnabled ?? false,
              mailketingApiToken: "",
              mailketingSenderName: integration?.mailketingSenderName ?? "",
              mailketingSenderEmail: integration?.mailketingSenderEmail ?? "",
              gmailOAuthEnabled: integration?.gmailOAuthEnabled ?? false,
              gmailSenderEmail: integration?.gmailSenderEmail ?? "",
              gmailSenderName: integration?.gmailSenderName ?? "",
              gmailClientId: integration?.gmailClientId ?? "",
              gmailClientSecret: "",
              gmailRefreshToken: "",
              telegramEnabled: integration?.telegramEnabled ?? false,
              telegramBotToken: "",
              telegramChatId: integration?.telegramChatId ?? "",
              telegramMessageThreadId:
                integration?.telegramMessageThreadId ?? "",
              whatsappProvider: integration?.whatsappProvider ?? "",
              whatsappApiKey: "",
              whatsappSenderNumber: integration?.whatsappSenderNumber ?? "",
              whatsappPhoneNumberId: integration?.whatsappPhoneNumberId ?? "",
              whatsappWebhookVerifyToken: "",
              whatsappWebhookSecret: "",
              whatsappIsActive: integration?.whatsappIsActive ?? false,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
