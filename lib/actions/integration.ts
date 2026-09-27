"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { rateLimitShared } from "@/lib/rate-limit";
import { revalidatePublicPages } from "@/lib/public-page";
import {
  testIntegrationConnection,
  type ConnectionTestProvider,
} from "@/lib/integration-health";
import {
  changedSettingFields,
  describeSettingsChange,
  recordSettingsAudit,
} from "@/lib/settings-audit";
import {
  isStaleSettingsWrite,
  SETTINGS_VERSION_FIELD,
  STALE_WRITE_MESSAGE,
} from "@/lib/settings-version";
import { getCurrentWorkspace } from "@/lib/workspace";
import { sanitizeCustomScript } from "@/lib/integrations";
import { integrationSettingSchema } from "@/lib/zod";
import {
  CLEAR_SECRET_SUFFIX,
  resolveSecretUpdate,
} from "@/lib/secret-fields";
import { INTEGRATION_SECRET_FIELDS } from "@/lib/integration-secrets";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";

import { clearAdConsentCache, clientIpFrom } from "@/lib/ad-events";
import { buildGa4Payload, clearGa4ConfigCache, sendGa4Payload } from "@/lib/ga4-measurement";
import { describeAdSendFailure } from "@/lib/ad-event-queue";
import { clearMetaCapiConfigCache, sendMetaCapiEvent } from "@/lib/meta-capi";
import { publicSiteHref } from "@/lib/public-url";
import {
  buildTikTokEventPayload,
  clearTikTokConfigCache,
  sendTikTokEventsBatch,
} from "@/lib/tiktok-events";

type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type TestEventResult = { ok: true; message: string } | { ok: false; error: string };

export async function updateIntegrationsAction(
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "branding.edit")) {
    return { ok: false, error: "Tidak diizinkan." };
  }

  const limit = await rateLimitShared(
    `settings:integrations:${session.user.id}`,
    30,
    5 * 60 * 1000
  );
  if (!limit.ok) {
    return {
      ok: false,
      error: "Terlalu sering menyimpan pengaturan. Coba lagi sebentar lagi.",
    };
  }

  const parsed = integrationSettingSchema.safeParse({
    metaPixelId: formData.get("metaPixelId") ?? "",
    metaCapiEnabled: formData.get("metaCapiEnabled") ?? false,
    metaCapiAccessToken: formData.get("metaCapiAccessToken") ?? "",
    metaCapiTestEventCode: formData.get("metaCapiTestEventCode") ?? "",
    tiktokPixelId: formData.get("tiktokPixelId") ?? "",
    tiktokEventsApiEnabled: formData.get("tiktokEventsApiEnabled") ?? false,
    tiktokAccessToken: formData.get("tiktokAccessToken") ?? "",
    tiktokTestEventCode: formData.get("tiktokTestEventCode") ?? "",
    googleAnalyticsApiSecret: formData.get("googleAnalyticsApiSecret") ?? "",
    googleAdsConversionId: formData.get("googleAdsConversionId") ?? "",
    googleAdsPurchaseLabel: formData.get("googleAdsPurchaseLabel") ?? "",
    adConsentRequired: formData.get("adConsentRequired") ?? false,
    googleAnalyticsId: formData.get("googleAnalyticsId") ?? "",
    googleTagManagerId: formData.get("googleTagManagerId") ?? "",
    googleSearchConsoleVerification:
      formData.get("googleSearchConsoleVerification") ?? "",
    customHeadScript: formData.get("customHeadScript") ?? "",
    mailketingEnabled: formData.get("mailketingEnabled") ?? false,
    mailketingApiToken: formData.get("mailketingApiToken") ?? "",
    mailketingSenderName: formData.get("mailketingSenderName") ?? "",
    mailketingSenderEmail: formData.get("mailketingSenderEmail") ?? "",
    gmailOAuthEnabled: formData.get("gmailOAuthEnabled") ?? false,
    gmailSenderEmail: formData.get("gmailSenderEmail") ?? "",
    gmailSenderName: formData.get("gmailSenderName") ?? "",
    gmailClientId: formData.get("gmailClientId") ?? "",
    gmailClientSecret: formData.get("gmailClientSecret") ?? "",
    gmailRefreshToken: formData.get("gmailRefreshToken") ?? "",
    telegramEnabled: formData.get("telegramEnabled") ?? false,
    telegramBotToken: formData.get("telegramBotToken") ?? "",
    telegramChatId: formData.get("telegramChatId") ?? "",
    telegramMessageThreadId:
      formData.get("telegramMessageThreadId") ?? "",
    whatsappProvider: formData.get("whatsappProvider") ?? "",
    whatsappApiKey: formData.get("whatsappApiKey") ?? "",
    whatsappSenderNumber: formData.get("whatsappSenderNumber") ?? "",
    whatsappPhoneNumberId: formData.get("whatsappPhoneNumberId") ?? "",
    whatsappWebhookVerifyToken:
      formData.get("whatsappWebhookVerifyToken") ?? "",
    whatsappWebhookSecret: formData.get("whatsappWebhookSecret") ?? "",
    whatsappIsActive: formData.get("whatsappIsActive") ?? false,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Periksa kembali isian yang ditandai.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const customScript = sanitizeCustomScript(parsed.data.customHeadScript);
  if (parsed.data.customHeadScript && !customScript) {
    return {
      ok: false,
      error:
        "Custom script ditolak — maksimal 2000 karakter dan tidak boleh mengandung </script> atau komentar HTML.",
      fieldErrors: {
        customHeadScript: ["Ditolak pemeriksaan keamanan."],
      },
    };
  }

  const data = {
    metaPixelId: parsed.data.metaPixelId?.trim() || null,
    metaCapiEnabled: parsed.data.metaCapiEnabled,
    metaCapiTestEventCode: parsed.data.metaCapiTestEventCode?.trim() || null,
    tiktokPixelId: parsed.data.tiktokPixelId?.trim().toUpperCase() || null,
    tiktokEventsApiEnabled: parsed.data.tiktokEventsApiEnabled,
    tiktokTestEventCode: parsed.data.tiktokTestEventCode?.trim() || null,
    googleAdsConversionId: parsed.data.googleAdsConversionId?.trim().toUpperCase() || null,
    googleAdsPurchaseLabel: parsed.data.googleAdsPurchaseLabel?.trim() || null,
    adConsentRequired: parsed.data.adConsentRequired,
    googleAnalyticsId: parsed.data.googleAnalyticsId?.trim() || null,
    googleTagManagerId: parsed.data.googleTagManagerId?.trim() || null,
    googleSearchConsoleVerification:
      parsed.data.googleSearchConsoleVerification?.trim() || null,
    customHeadScript: customScript,
    mailketingEnabled: parsed.data.mailketingEnabled,
    mailketingSenderName:
      parsed.data.mailketingSenderName?.trim() || null,
    mailketingSenderEmail:
      parsed.data.mailketingSenderEmail?.trim().toLowerCase() || null,
    gmailOAuthEnabled: parsed.data.gmailOAuthEnabled,
    gmailSenderEmail:
      parsed.data.gmailSenderEmail?.trim().toLowerCase() || null,
    gmailSenderName: parsed.data.gmailSenderName?.trim() || null,
    gmailClientId: parsed.data.gmailClientId?.trim() || null,
    telegramEnabled: parsed.data.telegramEnabled,
    telegramChatId: parsed.data.telegramChatId?.trim() || null,
    telegramMessageThreadId:
      parsed.data.telegramMessageThreadId?.trim() || null,
    whatsappProvider: parsed.data.whatsappProvider || null,
    whatsappSenderNumber: parsed.data.whatsappSenderNumber?.trim() || null,
    whatsappPhoneNumberId: parsed.data.whatsappPhoneNumberId?.trim() || null,
    whatsappIsActive: parsed.data.whatsappIsActive,
  };

  // Secrets are never sent to the browser, so a blank field means "keep what
  // is stored", not "erase it". Only an explicit clear flag removes one.
  const secrets: Record<string, string | null> = {};
  for (const field of INTEGRATION_SECRET_FIELDS) {
    const update = resolveSecretUpdate(
      parsed.data[field],
      formData.get(`${field}${CLEAR_SECRET_SUFFIX}`)
    );
    if (update !== undefined) secrets[field] = update;
  }

  // Dibaca sebelum menulis supaya audit bisa menyebut field mana yang berubah.
  // Nilainya sendiri tidak pernah ikut tercatat.
  const before = await prisma.integrationSetting.findUnique({
    where: { workspaceId: current.workspace.id },
  });

  if (isStaleSettingsWrite(formData.get(SETTINGS_VERSION_FIELD), before?.updatedAt)) {
    return { ok: false, error: STALE_WRITE_MESSAGE };
  }

  await prisma.integrationSetting.upsert({
    where: { workspaceId: current.workspace.id },
    update: { ...data, ...secrets },
    create: { workspaceId: current.workspace.id, ...data, ...secrets },
  });

  const changedFields = [
    ...changedSettingFields(
      before as unknown as Record<string, unknown> | null,
      data
    ),
    // Rahasia dibandingkan lewat kehadirannya, bukan nilainya: yang tersimpan
    // tidak pernah dibaca balik untuk dibandingkan.
    ...Object.keys(secrets),
  ];
  await recordSettingsAudit(prisma, {
    workspaceId: current.workspace.id,
    actorId: session.user.id,
    action: "settings.integrations.updated",
    changedFields,
    summary: describeSettingsChange("Integrasi", changedFields),
    targetType: "integrationSetting",
    targetId: current.workspace.id,
  });

  // Halaman publik memakai nomor ini untuk tombol WhatsApp yang masih berisi
  // nomor contoh; tanpa ini, perubahan nomor baru terlihat setelah cache
  // halaman kedaluwarsa sendiri.
  if (changedFields.includes("whatsappSenderNumber")) {
    revalidatePublicPages(current.workspace.id);
  }

  clearMetaCapiConfigCache(current.workspace.id);
  clearTikTokConfigCache(current.workspace.id);
  clearGa4ConfigCache(current.workspace.id);
  clearAdConsentCache(current.workspace.id);

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/settings/integrations");
  return { ok: true };
}

/**
 * Sends one event straight to Meta or TikTok with the stored credentials and
 * the stored test event code, so the operator can confirm the setup in Events
 * Manager right away instead of waiting for real traffic. A test code is
 * required: without one the test would be counted as a real event.
 */
export async function sendAdTestEventAction(
  provider: "META" | "TIKTOK" | "GA4"
): Promise<TestEventResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "branding.edit")) {
    return { ok: false, error: "Not allowed." };
  }

  const integration = await prisma.integrationSetting.findUnique({
    where: { workspaceId: current.workspace.id },
  });
  const h = headers();
  const common = {
    eventId: `test:${randomUUID()}`,
    sourceUrl: publicSiteHref(current.workspace.slug, ""),
    clientIp: clientIpFrom(h.get("x-real-ip"), h.get("x-forwarded-for")),
    userAgent: h.get("user-agent"),
    customerData: { email: session.user.email, externalId: session.user.id },
  };

  if (provider === "META") {
    if (!integration?.metaPixelId || !integration.metaCapiAccessToken) {
      return { ok: false, error: "Simpan Meta Pixel ID dan access token CAPI dulu." };
    }
    if (!integration.metaCapiTestEventCode) {
      return {
        ok: false,
        error: "Isi dan simpan Test Event Code dari Events Manager dulu, supaya tes tidak terhitung sebagai event asli.",
      };
    }
    const result = await sendMetaCapiEvent({
      ...common,
      pixelId: integration.metaPixelId,
      accessToken: integration.metaCapiAccessToken,
      testEventCode: integration.metaCapiTestEventCode,
      eventName: "PageView",
    });
    return result.ok
      ? {
          ok: true,
          message: `Meta menerima event uji (${integration.metaCapiTestEventCode}). Cek tab Test Events di Events Manager.`,
        }
      : { ok: false, error: `Meta menolak: ${describeAdSendFailure(result)}` };
  }

  if (provider === "GA4") {
    if (!integration?.googleAnalyticsId || !integration.googleAnalyticsApiSecret) {
      return { ok: false, error: "Simpan GA4 Measurement ID dan API secret dulu." };
    }
    // The debug endpoint validates without recording anything, so no test
    // code is needed — and it is the only way to catch a malformed event,
    // because the real endpoint accepts everything.
    const result = await sendGa4Payload(
      {
        measurementId: integration.googleAnalyticsId,
        apiSecret: integration.googleAnalyticsApiSecret,
      },
      buildGa4Payload({
        name: "purchase",
        clientId: `test.${Date.now()}`,
        params: {
          transaction_id: common.eventId,
          value: 1000,
          currency: "IDR",
          items: [{ item_id: "test-item", item_name: "Event uji", price: 1000, quantity: 1 }],
        },
      }),
      { debug: true }
    );
    return result.ok
      ? {
          ok: true,
          message:
            "GA4 memvalidasi event purchase uji tanpa error. Catatan: Google tidak memeriksa API secret di mode ini, jadi pastikan secret sesuai dengan yang dibuat di Admin → Data Streams.",
        }
      : { ok: false, error: `GA4 menolak format event: ${describeAdSendFailure(result)}` };
  }

  if (!integration?.tiktokPixelId || !integration.tiktokAccessToken) {
    return { ok: false, error: "Simpan TikTok Pixel ID dan access token Events API dulu." };
  }
  if (!integration.tiktokTestEventCode) {
    return {
      ok: false,
      error: "Isi dan simpan Test Event Code dari TikTok Events Manager dulu, supaya tes tidak terhitung sebagai event asli.",
    };
  }
  const payload = buildTikTokEventPayload({ ...common, eventName: "ViewContent" });
  if (!payload) return { ok: false, error: "Event uji tidak didukung." };
  const result = await sendTikTokEventsBatch(
    {
      pixelId: integration.tiktokPixelId,
      accessToken: integration.tiktokAccessToken,
      testEventCode: integration.tiktokTestEventCode,
    },
    [payload]
  );
  return result.ok
    ? {
        ok: true,
        message: `TikTok menerima event uji (${integration.tiktokTestEventCode}). Cek tab Test Events di TikTok Events Manager.`,
      }
    : { ok: false, error: `TikTok menolak: ${describeAdSendFailure(result)}` };
}

const CONNECTION_TEST_PROVIDERS: ConnectionTestProvider[] = [
  "MIDTRANS",
  "MAILKETING",
  "GMAIL",
  "TELEGRAM",
  "WHATSAPP",
];

/**
 * Memeriksa satu kredensial tersimpan dengan panggilan termurah yang tetap
 * membuktikan kredensialnya diterima. Tidak ada pesan yang dikirim ke
 * pelanggan, jadi aman ditekan berkali-kali.
 */
export async function testIntegrationConnectionAction(
  provider: string
): Promise<TestEventResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "branding.edit")) {
    return { ok: false, error: "Tidak diizinkan." };
  }

  if (!CONNECTION_TEST_PROVIDERS.includes(provider as ConnectionTestProvider)) {
    return { ok: false, error: "Layanan tidak dikenal." };
  }

  // Tes memanggil API pihak ketiga, jadi dibatasi lebih ketat dari simpanan.
  const limit = await rateLimitShared(
    `integration-test:${session.user.id}`,
    20,
    5 * 60 * 1000
  );
  if (!limit.ok) {
    return { ok: false, error: "Terlalu sering menguji. Coba lagi nanti." };
  }

  const result = await testIntegrationConnection(
    current.workspace.id,
    provider as ConnectionTestProvider
  );
  return result.ok
    ? { ok: true, message: result.message }
    : { ok: false, error: result.error };
}
