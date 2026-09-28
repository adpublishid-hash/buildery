"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  KeyRound,
  Loader2,
  Mail,
  Send,
  ServerCog,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ExtraPixelsManager, type ExtraPixelView } from "@/components/settings/extra-pixels-manager";
import { TabBar } from "@/components/ui/tab-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  sendAdTestEventAction,
  updateIntegrationsAction,
} from "@/lib/actions/integration";
import type { AdDeliveryStatus } from "@/lib/ad-event-queue";
import {
  INTEGRATION_SECRET_FIELDS,
  type IntegrationSecretField,
} from "@/lib/integration-secrets";
import { SETTINGS_VERSION_FIELD } from "@/lib/settings-version";
import { ConnectionTestButton } from "@/components/settings/connection-test-button";
import { CLEAR_SECRET_SUFFIX } from "@/lib/secret-fields";

export type IntegrationFormValues = {
  metaPixelId: string;
  metaCapiEnabled: boolean;
  metaCapiAccessToken: string;
  metaCapiTestEventCode: string;
  tiktokPixelId: string;
  tiktokEventsApiEnabled: boolean;
  tiktokAccessToken: string;
  tiktokTestEventCode: string;
  googleAnalyticsId: string;
  googleAnalyticsApiSecret: string;
  googleAdsConversionId: string;
  googleAdsPurchaseLabel: string;
  adConsentRequired: boolean;
  googleTagManagerId: string;
  googleSearchConsoleVerification: string;
  customHeadScript: string;
  mailketingEnabled: boolean;
  mailketingApiToken: string;
  mailketingSenderName: string;
  mailketingSenderEmail: string;
  gmailOAuthEnabled: boolean;
  gmailSenderEmail: string;
  gmailSenderName: string;
  gmailClientId: string;
  gmailClientSecret: string;
  gmailRefreshToken: string;
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  telegramMessageThreadId: string;
  whatsappProvider: string;
  whatsappApiKey: string;
  whatsappSenderNumber: string;
  whatsappPhoneNumberId: string;
  whatsappApiBaseUrl: string;
  whatsappUserCode: string;
  whatsappWebhookVerifyToken: string;
  whatsappWebhookSecret: string;
  whatsappIsActive: boolean;
};

/**
 * Sub-tabs of the integrations form.
 *
 * The form is one `<form>` with one save button, so every panel stays mounted
 * and inactive ones are only hidden — the save still submits every field, and
 * `isDirty` still sees edits made in a tab the operator has navigated away from.
 */
const INTEGRATION_TABS = [
  { key: "ringkasan", label: "Ringkasan" },
  { key: "meta", label: "Meta" },
  { key: "tiktok", label: "TikTok" },
  { key: "google", label: "Google" },
  { key: "privasi", label: "Privasi & katalog" },
  { key: "email", label: "Email" },
  { key: "telegram", label: "Telegram" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "script", label: "Script" },
] as const;

type IntegrationTab = (typeof INTEGRATION_TABS)[number]["key"];

/** Which tab holds each field, so a rejected save can reveal the bad input. */
const FIELD_TAB: Record<keyof IntegrationFormValues, IntegrationTab> = {
  metaPixelId: "meta",
  metaCapiEnabled: "meta",
  metaCapiAccessToken: "meta",
  metaCapiTestEventCode: "meta",
  tiktokPixelId: "tiktok",
  tiktokEventsApiEnabled: "tiktok",
  tiktokAccessToken: "tiktok",
  tiktokTestEventCode: "tiktok",
  googleAnalyticsId: "google",
  googleAnalyticsApiSecret: "google",
  googleAdsConversionId: "google",
  googleAdsPurchaseLabel: "google",
  googleTagManagerId: "google",
  googleSearchConsoleVerification: "google",
  adConsentRequired: "privasi",
  customHeadScript: "script",
  mailketingEnabled: "email",
  mailketingApiToken: "email",
  mailketingSenderName: "email",
  mailketingSenderEmail: "email",
  gmailOAuthEnabled: "email",
  gmailSenderEmail: "email",
  gmailSenderName: "email",
  gmailClientId: "email",
  gmailClientSecret: "email",
  gmailRefreshToken: "email",
  telegramEnabled: "telegram",
  telegramBotToken: "telegram",
  telegramChatId: "telegram",
  telegramMessageThreadId: "telegram",
  whatsappProvider: "whatsapp",
  whatsappApiKey: "whatsapp",
  whatsappSenderNumber: "whatsapp",
  whatsappPhoneNumberId: "whatsapp",
  whatsappApiBaseUrl: "whatsapp",
  whatsappUserCode: "whatsapp",
  whatsappWebhookVerifyToken: "whatsapp",
  whatsappWebhookSecret: "whatsapp",
  whatsappIsActive: "whatsapp",
};

type Props = {
  defaultValues: IntegrationFormValues;
  canEdit: boolean;
  /** Versi baris saat halaman dimuat, untuk menolak simpanan yang basi. */
  loadedAt: string;
  gmailRedirectUri: string;
  metaCapiStatus: AdDeliveryStatus;
  tiktokStatus: AdDeliveryStatus;
  extraPixels: { META: ExtraPixelView[]; TIKTOK: ExtraPixelView[] };
  ga4Status: AdDeliveryStatus;
  catalog: {
    url: string;
    items: number;
    skippedWithoutImage: number;
    truncated: boolean;
  };
  /** "••••1234" for each credential that is stored, null when none is. */
  secretHints: Partial<Record<IntegrationSecretField, string | null>>;
};

export function IntegrationsForm({
  defaultValues,
  canEdit,
  loadedAt,
  gmailRedirectUri,
  metaCapiStatus,
  tiktokStatus,
  extraPixels,
  ga4Status,
  catalog,
  secretHints,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  // The integrations catalog links here with ?section=<tab> to open one panel.
  const sectionParam = searchParams?.get("section");
  const [tab, setTab] = useState<IntegrationTab>(() =>
    INTEGRATION_TABS.some((item) => item.key === sectionParam) ? (sectionParam as IntegrationTab) : "ringkasan"
  );
  useEffect(() => {
    if (INTEGRATION_TABS.some((item) => item.key === sectionParam)) setTab(sectionParam as IntegrationTab);
  }, [sectionParam]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [whatsappIsActive, setWhatsappIsActive] = useState(
    defaultValues.whatsappIsActive
  );
  const [metaCapiEnabled, setMetaCapiEnabled] = useState(
    defaultValues.metaCapiEnabled
  );
  const [tiktokEventsApiEnabled, setTiktokEventsApiEnabled] = useState(
    defaultValues.tiktokEventsApiEnabled
  );
  const [testingProvider, setTestingProvider] = useState<
    "META" | "TIKTOK" | "GA4" | null
  >(null);
  const [adConsentRequired, setAdConsentRequired] = useState(
    defaultValues.adConsentRequired
  );
  const [mailketingEnabled, setMailketingEnabled] = useState(
    defaultValues.mailketingEnabled
  );
  const [gmailOAuthEnabled, setGmailOAuthEnabled] = useState(
    defaultValues.gmailOAuthEnabled
  );
  const [telegramEnabled, setTelegramEnabled] = useState(
    defaultValues.telegramEnabled
  );
  // Stored credentials the operator asked to delete on the next save.
  const [clearedSecrets, setClearedSecrets] = useState<
    Set<IntegrationSecretField>
  >(new Set());

  function toggleClearSecret(field: IntegrationSecretField, clear: boolean) {
    setClearedSecrets((current) => {
      const next = new Set(current);
      if (clear) next.add(field);
      else next.delete(field);
      return next;
    });
  }

  /** Placeholder that admits a secret is stored without echoing it back. */
  function secretPlaceholder(field: IntegrationSecretField, fallback: string) {
    const hint = secretHints[field];
    if (!hint) return fallback;
    return clearedSecrets.has(field)
      ? "Akan dihapus saat disimpan"
      : `Tersimpan (${hint}) — kosongkan untuk tetap memakai`;
  }

  function storedSecretControl(field: IntegrationSecretField) {
    if (!secretHints[field]) return null;
    return (
      <label className="flex items-center gap-2 text-[11px] text-zinc-500">
        <input
          type="checkbox"
          checked={clearedSecrets.has(field)}
          onChange={(event) => toggleClearSecret(field, event.target.checked)}
          disabled={!canEdit}
        />
        Hapus yang tersimpan
      </label>
    );
  }

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<IntegrationFormValues>({ defaultValues });
  const watched = watch();
  const waHints = whatsappProviderHints(watched.whatsappProvider);
  const gmailOAuthClientSaved = Boolean(
    defaultValues.gmailClientId.trim() && secretHints.gmailClientSecret
  );
  const gmailOAuthConnected = Boolean(secretHints.gmailRefreshToken);
  const gmailStatus = searchParams?.get("gmail");

  /** A token counts as present when one is typed or one is already stored. */
  function hasSecret(field: IntegrationSecretField) {
    if (clearedSecrets.has(field)) return Boolean(watched[field]?.trim());
    return Boolean(watched[field]?.trim() || secretHints[field]);
  }

  useEffect(() => {
    if (!gmailStatus) return;
    // Coming back from Google's consent screen: open the tab the result is about.
    setTab("email");

    const messages: Record<string, { type: "success" | "error"; text: string }> =
      {
        connected: {
          type: "success",
          text: "Gmail connected. Refresh token saved.",
        },
        missing: {
          type: "error",
          text: "Save OAuth client ID and secret before connecting Gmail.",
        },
        denied: {
          type: "error",
          text: "Gmail authorization was cancelled.",
        },
        invalid: {
          type: "error",
          text: "Gmail authorization expired. Try connecting again.",
        },
        forbidden: {
          type: "error",
          text: "You are not allowed to edit this integration.",
        },
        no_refresh_token: {
          type: "error",
          text: "Google did not return a refresh token. Revoke access and connect again.",
        },
        token_failed: {
          type: "error",
          text: "Could not finish Gmail OAuth. Check the OAuth redirect URI.",
        },
      };

    const message = messages[gmailStatus];
    if (message?.type === "success") toast.success(message.text);
    if (message?.type === "error") toast.error(message.text);
    router.replace("/dashboard/settings/integrations", { scroll: false });
  }, [gmailStatus, router]);

  const analyticsStatus = [
    {
      label: "Meta Pixel",
      active: Boolean(watched.metaPixelId?.trim()),
      detail: watched.metaPixelId?.trim()
        ? "Browser Pixel aktif di halaman publik."
        : "Isi Pixel ID untuk browser tracking.",
    },
    {
      label: "Meta CAPI",
      active: Boolean(
        metaCapiEnabled &&
          watched.metaPixelId?.trim() &&
          hasSecret("metaCapiAccessToken")
      ),
      detail:
        metaCapiEnabled && hasSecret("metaCapiAccessToken")
          ? "Server event siap untuk deduplication."
          : "Butuh Pixel ID, token, dan toggle aktif.",
    },
    {
      label: "TikTok Pixel",
      active: Boolean(watched.tiktokPixelId?.trim()),
      detail: watched.tiktokPixelId?.trim()
        ? "Browser Pixel aktif di halaman publik."
        : "Isi Pixel ID untuk browser tracking.",
    },
    {
      label: "TikTok Events API",
      active: Boolean(
        tiktokEventsApiEnabled &&
          watched.tiktokPixelId?.trim() &&
          hasSecret("tiktokAccessToken")
      ),
      detail:
        tiktokEventsApiEnabled && hasSecret("tiktokAccessToken")
          ? "Server event siap untuk deduplication."
          : "Butuh Pixel ID, token, dan toggle aktif.",
    },
    {
      label: "GA4",
      active: Boolean(watched.googleAnalyticsId?.trim()),
      detail: watched.googleAnalyticsId?.trim()
        ? "Manual page_view aktif untuk halaman publik."
        : "Isi Measurement ID untuk GA4.",
    },
    {
      label: "GA4 server",
      active: Boolean(
        watched.googleAnalyticsId?.trim() && hasSecret("googleAnalyticsApiSecret")
      ),
      detail:
        watched.googleAnalyticsId?.trim() && hasSecret("googleAnalyticsApiSecret")
          ? "Purchase & refund juga dikirim dari server."
          : "Isi API secret untuk purchase dari server.",
    },
    {
      label: "Google Ads",
      active: Boolean(
        watched.googleAdsConversionId?.trim() && watched.googleAdsPurchaseLabel?.trim()
      ),
      detail: watched.googleAdsConversionId?.trim()
        ? "Konversi purchase + enhanced conversions."
        : "Opsional untuk konversi Google Ads.",
    },
    {
      label: "GTM",
      active: Boolean(watched.googleTagManagerId?.trim()),
      detail: watched.googleTagManagerId?.trim()
        ? "Container Tag Manager akan dimuat."
        : "Opsional untuk tag tambahan.",
    },
    {
      label: "Mailketing",
      active: Boolean(
        mailketingEnabled &&
          watched.mailketingApiToken?.trim() &&
          watched.mailketingSenderEmail?.trim()
      ),
      detail:
        mailketingEnabled && watched.mailketingSenderEmail?.trim()
          ? "Email ke pembeli dikirim via Mailketing."
          : "Opsional untuk email pembeli via Mailketing API.",
    },
    {
      label: "Gmail",
      active: Boolean(
        gmailOAuthEnabled &&
          watched.gmailSenderEmail?.trim() &&
          watched.gmailRefreshToken?.trim()
      ),
      detail:
        gmailOAuthEnabled && watched.gmailSenderEmail?.trim()
          ? "Email ke pembeli dikirim via Gmail API."
          : "Opsional untuk email pembeli via Gmail OAuth2.",
    },
    {
      label: "Telegram",
      active: Boolean(
        telegramEnabled &&
          watched.telegramBotToken?.trim() &&
          watched.telegramChatId?.trim()
      ),
      detail:
        telegramEnabled && watched.telegramChatId?.trim()
          ? "Notifikasi internal dikirim ke chat Telegram."
          : "Opsional untuk notifikasi order dan form ke Telegram.",
    },
    {
      label: "Search Console",
      active: Boolean(watched.googleSearchConsoleVerification?.trim()),
      detail: watched.googleSearchConsoleVerification?.trim()
        ? "Meta verification akan dipasang."
        : "Opsional untuk verifikasi domain.",
    },
  ];

  function handleMetaCapiToggle(checked: boolean) {
    setMetaCapiEnabled(checked);
    setValue("metaCapiEnabled", checked, { shouldDirty: true });
  }

  function handleTiktokToggle(checked: boolean) {
    setTiktokEventsApiEnabled(checked);
    setValue("tiktokEventsApiEnabled", checked, { shouldDirty: true });
  }

  function handleConsentToggle(checked: boolean) {
    setAdConsentRequired(checked);
    setValue("adConsentRequired", checked, { shouldDirty: true });
  }

  async function copyCatalogUrl() {
    try {
      await navigator.clipboard.writeText(catalog.url);
      toast.success("URL katalog disalin");
    } catch {
      toast.message(catalog.url);
    }
  }

  function handleSendTestEvent(provider: "META" | "TIKTOK" | "GA4") {
    if (!canEdit) return;
    if (isDirty) {
      toast.message("Simpan perubahan dulu, lalu kirim event uji.");
      return;
    }
    setTestingProvider(provider);
    startTransition(async () => {
      const res = await sendAdTestEventAction(provider);
      setTestingProvider(null);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  }

  function handleWhatsappToggle(checked: boolean) {
    setWhatsappIsActive(checked);
    setValue("whatsappIsActive", checked, { shouldDirty: true });
  }

  function handleGmailToggle(checked: boolean) {
    setGmailOAuthEnabled(checked);
    setValue("gmailOAuthEnabled", checked, { shouldDirty: true });
  }

  function handleMailketingToggle(checked: boolean) {
    setMailketingEnabled(checked);
    setValue("mailketingEnabled", checked, { shouldDirty: true });
  }

  function handleTelegramToggle(checked: boolean) {
    setTelegramEnabled(checked);
    setValue("telegramEnabled", checked, { shouldDirty: true });
  }

  function handleConnectGmail() {
    if (!canEdit) return;
    if (!gmailOAuthClientSaved || isDirty) {
      toast.message("Save OAuth client ID and secret first.");
      return;
    }
    window.location.href = "/api/integrations/gmail/oauth/start";
  }

  function onSubmit(values: IntegrationFormValues) {
    setServerError(null);
    const fd = new FormData();
    for (const [k, v] of Object.entries(values)) fd.set(k, v as string);
    fd.set(SETTINGS_VERSION_FIELD, loadedAt);
    fd.set("metaCapiEnabled", String(metaCapiEnabled));
    fd.set("tiktokEventsApiEnabled", String(tiktokEventsApiEnabled));
    fd.set("adConsentRequired", String(adConsentRequired));
    fd.set("mailketingEnabled", String(mailketingEnabled));
    fd.set("gmailOAuthEnabled", String(gmailOAuthEnabled));
    fd.set("telegramEnabled", String(telegramEnabled));
    fd.set("whatsappIsActive", String(whatsappIsActive));
    for (const field of clearedSecrets) {
      fd.set(`${field}${CLEAR_SECRET_SUFFIX}`, "true");
    }

    startTransition(async () => {
      const res = await updateIntegrationsAction(fd);
      if (!res.ok) {
        setServerError(res.error);
        if (res.fieldErrors) {
          let firstTab: IntegrationTab | null = null;
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            if (msgs?.[0]) {
              const key = field as keyof IntegrationFormValues;
              setError(key, { message: msgs[0] });
              firstTab = firstTab ?? FIELD_TAB[key] ?? null;
            }
          }
          // The rejected field may sit in a hidden tab; show it, or the error
          // message would point at something the operator cannot see.
          if (firstTab) setTab(firstTab);
        }
        return;
      }
      toast.success("Integrations saved");
      setClearedSecrets(new Set());
      reset({
        ...values,
        ...Object.fromEntries(
          INTEGRATION_SECRET_FIELDS.map((field) => [field, ""])
        ),
        metaCapiEnabled,
        tiktokEventsApiEnabled,
        adConsentRequired,
        mailketingEnabled,
        gmailOAuthEnabled,
        telegramEnabled,
        whatsappIsActive,
      });
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <TabBar
        ariaLabel="Kelompok integrasi"
        items={INTEGRATION_TABS.map((item) => ({ ...item }))}
        active={tab}
        onSelect={(key) => setTab(key as IntegrationTab)}
        className="border-zinc-200 bg-zinc-50/70 dark:bg-zinc-900/40"
      />

      <TabPanel active={tab} value="meta">
      <div className="rounded-xl border border-zinc-200 p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-950">
              Meta Pixel + Conversions API
            </h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">
              Kirim PageView dari browser Pixel dan server-side CAPI dengan
              event ID yang sama agar Meta bisa melakukan deduplication.
            </p>
          </div>
          <input
            type="hidden"
            value={String(metaCapiEnabled)}
            {...register("metaCapiEnabled")}
          />
          <Switch
            checked={metaCapiEnabled}
            onCheckedChange={handleMetaCapiToggle}
            disabled={!canEdit}
          />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="metaPixelId">Meta Pixel ID</Label>
            <Input
              id="metaPixelId"
              placeholder="123456789012345"
              disabled={!canEdit}
              {...register("metaPixelId")}
            />
            {errors.metaPixelId && (
              <p className="text-xs text-red-600">
                {errors.metaPixelId.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="metaCapiTestEventCode">
              CAPI test event code
            </Label>
            <Input
              id="metaCapiTestEventCode"
              placeholder="TEST12345"
              disabled={!canEdit}
              {...register("metaCapiTestEventCode")}
            />
            {errors.metaCapiTestEventCode ? (
              <p className="text-xs text-red-600">
                {errors.metaCapiTestEventCode.message}
              </p>
            ) : (
              <p className="text-[11px] text-zinc-400">
                Opsional. Isi saat testing di Events Manager, kosongkan untuk
                production.
              </p>
            )}
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="metaCapiAccessToken">CAPI access token</Label>
            <Input
              id="metaCapiAccessToken"
              type="password"
              placeholder={secretPlaceholder("metaCapiAccessToken", "EAAB...")}
              disabled={!canEdit}
              {...register("metaCapiAccessToken")}
            />
            {storedSecretControl("metaCapiAccessToken")}
            {errors.metaCapiAccessToken ? (
              <p className="text-xs text-red-600">
                {errors.metaCapiAccessToken.message}
              </p>
            ) : (
              <p className="text-[11px] text-zinc-400">
                Token hanya disimpan server-side dan tidak pernah dikirim ke
                browser.
              </p>
            )}
          </div>
        </div>

        <AdDeliveryPanel
          title="CAPI delivery"
          platform="Meta"
          status={metaCapiStatus}
          tokenMessage="Token Meta ditolak dalam 7 hari terakhir. Perbarui access token CAPI lalu simpan ulang integrasi."
          onTest={() => handleSendTestEvent("META")}
          testing={pending && testingProvider === "META"}
          canTest={canEdit}
        />
      </div>
      <ExtraPixelsManager provider="META" pixels={extraPixels.META} canEdit={canEdit} />
      </TabPanel>

      <TabPanel active={tab} value="tiktok">
      <div className="rounded-xl border border-zinc-200 p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-950">
              TikTok Pixel + Events API
            </h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">
              Event yang sama dengan Meta (lihat produk, keranjang, checkout,
              pembayaran, lead) dikirim ke TikTok dari browser dan server dengan
              event ID yang sama, sehingga TikTok menghitungnya sekali.
            </p>
          </div>
          <input
            type="hidden"
            value={String(tiktokEventsApiEnabled)}
            {...register("tiktokEventsApiEnabled")}
          />
          <Switch
            checked={tiktokEventsApiEnabled}
            onCheckedChange={handleTiktokToggle}
            disabled={!canEdit}
          />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tiktokPixelId">TikTok Pixel ID</Label>
            <Input
              id="tiktokPixelId"
              placeholder="C4ABCDEFGH1234567890"
              disabled={!canEdit}
              {...register("tiktokPixelId")}
            />
            {errors.tiktokPixelId ? (
              <p className="text-xs text-red-600">{errors.tiktokPixelId.message}</p>
            ) : (
              <p className="text-[11px] text-zinc-400">
                TikTok Ads Manager → Tools → Events → Web Events.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="tiktokTestEventCode">Events API test event code</Label>
            <Input
              id="tiktokTestEventCode"
              placeholder="TEST12345"
              disabled={!canEdit}
              {...register("tiktokTestEventCode")}
            />
            {errors.tiktokTestEventCode ? (
              <p className="text-xs text-red-600">
                {errors.tiktokTestEventCode.message}
              </p>
            ) : (
              <p className="text-[11px] text-zinc-400">
                Opsional. Isi saat testing, kosongkan untuk production.
              </p>
            )}
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="tiktokAccessToken">Events API access token</Label>
            <Input
              id="tiktokAccessToken"
              type="password"
              placeholder={secretPlaceholder("tiktokAccessToken", "Access token dari Events Manager")}
              disabled={!canEdit}
              {...register("tiktokAccessToken")}
            />
            {storedSecretControl("tiktokAccessToken")}
            {errors.tiktokAccessToken ? (
              <p className="text-xs text-red-600">
                {errors.tiktokAccessToken.message}
              </p>
            ) : (
              <p className="text-[11px] text-zinc-400">
                Token hanya disimpan server-side dan tidak pernah dikirim ke
                browser.
              </p>
            )}
          </div>
        </div>

        <AdDeliveryPanel
          title="Events API delivery"
          platform="TikTok"
          status={tiktokStatus}
          tokenMessage="Token TikTok ditolak dalam 7 hari terakhir. Buat access token baru di Events Manager lalu simpan ulang integrasi."
          onTest={() => handleSendTestEvent("TIKTOK")}
          testing={pending && testingProvider === "TIKTOK"}
          canTest={canEdit}
        />
      </div>
      <ExtraPixelsManager provider="TIKTOK" pixels={extraPixels.TIKTOK} canEdit={canEdit} />
      </TabPanel>

      <TabPanel active={tab} value="ringkasan">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-white text-zinc-700 shadow-sm ring-1 ring-zinc-200">
            <ServerCog className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-950">
              Status Integrasi
            </h3>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Ringkasan cepat untuk tag, email, verification, dan server-side
              event yang berjalan di halaman publik.
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {analyticsStatus.map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-zinc-200 bg-white p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-900">
                  {item.label}
                </span>
                {item.active ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : (
                  <CircleDashed className="size-4 text-zinc-300" />
                )}
              </div>
              <p className="mt-2 min-h-10 text-[11px] leading-5 text-zinc-500">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
      </TabPanel>

      <TabPanel active={tab} value="google">
      <div className="rounded-xl border border-zinc-200 p-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-950">
            Google Analytics 4 + Google Ads
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">
            GA4 menerima event e-commerce (lihat produk, keranjang, checkout,
            pembelian) dari browser. Dengan API secret, pembelian dan refund juga
            dikirim dari server sehingga tetap tercatat walau diblokir ad
            blocker. GA4 menghitung pembelian sekali per nomor order.
          </p>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="googleAnalyticsId">
              Google Analytics 4 Measurement ID
            </Label>
            <Input
              id="googleAnalyticsId"
              placeholder="G-XXXXXXXXXX"
              disabled={!canEdit}
              {...register("googleAnalyticsId")}
            />
            {errors.googleAnalyticsId ? (
              <p className="text-xs text-red-600">
                {errors.googleAnalyticsId.message}
              </p>
            ) : (
              <p className="text-[11px] text-zinc-400">
                Untuk manual page_view, matikan history page changes di Enhanced
                Measurement. Jika GTM sudah mengirim GA4, kosongkan field ini.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="googleAnalyticsApiSecret">
              Measurement Protocol API secret
            </Label>
            <Input
              id="googleAnalyticsApiSecret"
              type="password"
              placeholder={secretPlaceholder(
                "googleAnalyticsApiSecret",
                "Admin → Data Streams → Measurement Protocol"
              )}
              disabled={!canEdit}
              {...register("googleAnalyticsApiSecret")}
            />
            {storedSecretControl("googleAnalyticsApiSecret")}
            <p className="text-[11px] text-zinc-400">
              Opsional. Dipakai untuk purchase dan refund dari server.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="googleAdsConversionId">Google Ads conversion ID</Label>
            <Input
              id="googleAdsConversionId"
              placeholder="AW-123456789"
              disabled={!canEdit}
              {...register("googleAdsConversionId")}
            />
            {errors.googleAdsConversionId ? (
              <p className="text-xs text-red-600">
                {errors.googleAdsConversionId.message}
              </p>
            ) : (
              <p className="text-[11px] text-zinc-400">
                Google Ads → Goals → Conversions → Tag setup.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="googleAdsPurchaseLabel">Label konversi purchase</Label>
            <Input
              id="googleAdsPurchaseLabel"
              placeholder="AbCdEfGhIjk"
              disabled={!canEdit}
              {...register("googleAdsPurchaseLabel")}
            />
            {errors.googleAdsPurchaseLabel ? (
              <p className="text-xs text-red-600">
                {errors.googleAdsPurchaseLabel.message}
              </p>
            ) : (
              <p className="text-[11px] text-zinc-400">
                Bagian setelah garis miring pada send_to. Enhanced conversions
                memakai email/HP pembeli yang di-hash.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="googleTagManagerId">Google Tag Manager ID</Label>
            <Input
              id="googleTagManagerId"
              placeholder="GTM-XXXXXX"
              disabled={!canEdit}
              {...register("googleTagManagerId")}
            />
            {errors.googleTagManagerId && (
              <p className="text-xs text-red-600">
                {errors.googleTagManagerId.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="googleSearchConsoleVerification">
              Search Console token
            </Label>
            <Input
              id="googleSearchConsoleVerification"
              placeholder="Just the verification token (not the meta tag)"
              disabled={!canEdit}
              {...register("googleSearchConsoleVerification")}
            />
            {errors.googleSearchConsoleVerification && (
              <p className="text-xs text-red-600">
                {errors.googleSearchConsoleVerification.message}
              </p>
            )}
          </div>
        </div>
        <AdDeliveryPanel
          title="GA4 server delivery"
          platform="GA4"
          status={ga4Status}
          tokenMessage=""
          onTest={() => handleSendTestEvent("GA4")}
          testing={pending && testingProvider === "GA4"}
          canTest={canEdit}
        />
      </div>
      </TabPanel>

      <TabPanel active={tab} value="privasi">
      <div className="rounded-xl border border-zinc-200 p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-950">
              Persetujuan cookie
            </h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">
              Tampilkan banner di toko dan tahan Meta Pixel, TikTok Pixel, GA4,
              Google Ads, dan GTM — termasuk salinan event dari server — sampai
              pengunjung menekan &ldquo;Terima&rdquo;. Disarankan untuk kepatuhan UU
              PDP. Keranjang dan checkout tidak terpengaruh; custom head script
              tetap dimuat.
            </p>
            <p className="mt-2 max-w-2xl text-[11px] leading-5 text-amber-700">
              Pengunjung yang menolak tidak akan terukur, jadi angka di platform
              iklan akan turun dibanding tanpa banner.
            </p>
          </div>
          <input
            type="hidden"
            value={String(adConsentRequired)}
            {...register("adConsentRequired")}
          />
          <Switch
            checked={adConsentRequired}
            onCheckedChange={handleConsentToggle}
            disabled={!canEdit}
          />
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 p-4">
        <h3 className="text-sm font-semibold text-zinc-950">
          Katalog produk (Meta, TikTok, Google Merchant)
        </h3>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">
          Tempel URL ini sebagai sumber data terjadwal di Meta Commerce Manager,
          TikTok Catalog, atau Google Merchant Center untuk iklan katalog
          dinamis. ID produk dan varian sama dengan event pixel, jadi produk yang
          dilihat pengunjung bisa ditampilkan lagi di iklan.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input readOnly value={catalog.url} className="font-mono text-xs" />
          <Button type="button" variant="outline" onClick={copyCatalogUrl}>
            Salin URL
          </Button>
          <Button asChild type="button" variant="ghost">
            <a href={catalog.url} target="_blank" rel="noreferrer">
              <ExternalLink /> Buka
            </a>
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">
          {catalog.items.toLocaleString("id-ID")} item di feed.
          {catalog.skippedWithoutImage > 0
            ? ` ${catalog.skippedWithoutImage} produk tidak masuk karena belum punya gambar (wajib untuk iklan katalog).`
            : ""}
          {catalog.truncated ? " Feed dibatasi 5.000 produk pertama." : ""}
        </p>
      </div>
      </TabPanel>

      <TabPanel active={tab} value="email">
      <div className="mb-4 flex flex-wrap gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <ConnectionTestButton provider="MAILKETING" label="Tes Mailketing" />
        <ConnectionTestButton provider="GMAIL" label="Tes Gmail OAuth" />
      </div>
      <div className="rounded-xl border border-zinc-200 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200">
              <Mail className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-950">
                Mailketing Email API
              </h3>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">
                Diisi oleh user/workspace sendiri untuk email ke pembeli:
                notifikasi order, payment, dan form. Email aplikasi dari admin
                ke user My Landing memakai SMTP platform terpisah.
              </p>
            </div>
          </div>
          <input
            type="hidden"
            value={String(mailketingEnabled)}
            {...register("mailketingEnabled")}
          />
          <Switch
            checked={mailketingEnabled}
            onCheckedChange={handleMailketingToggle}
            disabled={!canEdit}
          />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="mailketingApiToken">API token</Label>
            <Input
              id="mailketingApiToken"
              type="password"
              placeholder={secretPlaceholder("mailketingApiToken", "Token dari menu Integration Mailketing")}
              disabled={!canEdit}
              {...register("mailketingApiToken")}
            />
            {storedSecretControl("mailketingApiToken")}
            {errors.mailketingApiToken && (
              <p className="text-xs text-red-600">
                {errors.mailketingApiToken.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="mailketingSenderName">From name</Label>
            <Input
              id="mailketingSenderName"
              placeholder="Nama Brand"
              disabled={!canEdit}
              {...register("mailketingSenderName")}
            />
            {errors.mailketingSenderName && (
              <p className="text-xs text-red-600">
                {errors.mailketingSenderName.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="mailketingSenderEmail">From email</Label>
            <Input
              id="mailketingSenderEmail"
              type="email"
              placeholder="sender@domainanda.com"
              disabled={!canEdit}
              {...register("mailketingSenderEmail")}
            />
            {errors.mailketingSenderEmail ? (
              <p className="text-xs text-red-600">
                {errors.mailketingSenderEmail.message}
              </p>
            ) : (
              <p className="text-[11px] text-zinc-400">
                Email pengirim harus sudah ditambahkan di Add Domain Mailketing.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200">
              <Send className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-950">
                Telegram Bot Notifications
              </h3>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">
                Kirim notifikasi internal untuk order, payment, dan form
                submission ke chat, grup, atau channel Telegram.
              </p>
            </div>
          </div>
          <input
            type="hidden"
            value={String(telegramEnabled)}
            {...register("telegramEnabled")}
          />
          <Switch
            checked={telegramEnabled}
            onCheckedChange={handleTelegramToggle}
            disabled={!canEdit}
          />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="telegramBotToken">Bot token</Label>
            <Input
              id="telegramBotToken"
              type="password"
              placeholder={secretPlaceholder("telegramBotToken", "1234567890:AA...")}
              disabled={!canEdit}
              {...register("telegramBotToken")}
            />
            {storedSecretControl("telegramBotToken")}
            {errors.telegramBotToken ? (
              <p className="text-xs text-red-600">
                {errors.telegramBotToken.message}
              </p>
            ) : (
              <p className="text-[11px] text-zinc-400">
                Buat bot lewat @BotFather, lalu masukkan token bot di sini.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="telegramChatId">Chat ID / channel username</Label>
            <Input
              id="telegramChatId"
              placeholder="-1001234567890 atau @channelusername"
              disabled={!canEdit}
              {...register("telegramChatId")}
            />
            {errors.telegramChatId ? (
              <p className="text-xs text-red-600">
                {errors.telegramChatId.message}
              </p>
            ) : (
              <p className="text-[11px] text-zinc-400">
                Tambahkan bot ke grup/channel tujuan sebelum mengirim.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="telegramMessageThreadId">
              Forum topic ID
            </Label>
            <Input
              id="telegramMessageThreadId"
              placeholder="Opsional untuk forum topic"
              disabled={!canEdit}
              {...register("telegramMessageThreadId")}
            />
            {errors.telegramMessageThreadId ? (
              <p className="text-xs text-red-600">
                {errors.telegramMessageThreadId.message}
              </p>
            ) : (
              <p className="text-[11px] text-zinc-400">
                Isi hanya jika grup Telegram memakai topic/forum.
              </p>
            )}
          </div>
        </div>
      </div>
      </TabPanel>

      <TabPanel active={tab} value="telegram">
      <div className="mb-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <ConnectionTestButton provider="TELEGRAM" label="Tes bot Telegram" />
      </div>
      <div className="rounded-xl border border-zinc-200 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200">
              <Mail className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-950">
                Gmail OAuth2 Email
              </h3>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">
                Diisi oleh user/workspace sendiri untuk mengirim email ke
                pembeli lewat Gmail API. Credential ini tidak dipakai untuk
                email aplikasi/admin My Landing ke user.
              </p>
            </div>
          </div>
          <input
            type="hidden"
            value={String(gmailOAuthEnabled)}
            {...register("gmailOAuthEnabled")}
          />
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleConnectGmail}
              disabled={!canEdit}
            >
              <KeyRound className="size-4" />
              Connect
            </Button>
            <Switch
              checked={gmailOAuthEnabled}
              onCheckedChange={handleGmailToggle}
              disabled={!canEdit}
            />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 text-xs text-zinc-600 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                {gmailOAuthConnected ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                ) : (
                  <CircleDashed className="size-4 shrink-0 text-zinc-400" />
                )}
                <span className="font-medium text-zinc-800">
                  {gmailOAuthConnected
                    ? "OAuth connected"
                    : "OAuth refresh token belum tersimpan"}
                </span>
              </div>
              <span className="text-zinc-500">
                Simpan client ID/secret, lalu klik Connect.
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="gmailSenderEmail">Sender Gmail</Label>
            <Input
              id="gmailSenderEmail"
              type="email"
              placeholder="nama@gmail.com"
              disabled={!canEdit}
              {...register("gmailSenderEmail")}
            />
            {errors.gmailSenderEmail && (
              <p className="text-xs text-red-600">
                {errors.gmailSenderEmail.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="gmailSenderName">Sender name</Label>
            <Input
              id="gmailSenderName"
              placeholder="Nama Brand"
              disabled={!canEdit}
              {...register("gmailSenderName")}
            />
            {errors.gmailSenderName && (
              <p className="text-xs text-red-600">
                {errors.gmailSenderName.message}
              </p>
            )}
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="gmailClientId">OAuth client ID</Label>
            <Input
              id="gmailClientId"
              placeholder="...apps.googleusercontent.com"
              disabled={!canEdit}
              {...register("gmailClientId")}
            />
            {errors.gmailClientId && (
              <p className="text-xs text-red-600">
                {errors.gmailClientId.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="gmailClientSecret">OAuth client secret</Label>
            <Input
              id="gmailClientSecret"
              type="password"
              placeholder={secretPlaceholder("gmailClientSecret", "GOCSPX-...")}
              disabled={!canEdit}
              {...register("gmailClientSecret")}
            />
            {storedSecretControl("gmailClientSecret")}
            {errors.gmailClientSecret && (
              <p className="text-xs text-red-600">
                {errors.gmailClientSecret.message}
              </p>
            )}
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="gmailRedirectUri">Authorized redirect URI</Label>
            <div className="flex gap-2">
              <Input
                id="gmailRedirectUri"
                value={gmailRedirectUri}
                readOnly
                className="font-mono text-xs"
              />
              <Button type="button" variant="outline" size="icon" asChild>
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open Google Cloud credentials"
                >
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            </div>
            <p className="text-[11px] text-zinc-400">
              Tambahkan URI ini di Google Cloud OAuth client sebelum klik
              Connect.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="gmailRefreshToken">Refresh token</Label>
            <Input
              id="gmailRefreshToken"
              type="password"
              placeholder={secretPlaceholder("gmailRefreshToken", "1//...")}
              disabled={!canEdit}
              {...register("gmailRefreshToken")}
            />
            {storedSecretControl("gmailRefreshToken")}
            {errors.gmailRefreshToken ? (
              <p className="text-xs text-red-600">
                {errors.gmailRefreshToken.message}
              </p>
            ) : (
              <p className="text-[11px] text-zinc-400">
                Akan terisi otomatis setelah Connect berhasil, atau bisa
                diisi manual.
              </p>
            )}
          </div>
        </div>
      </div>
      </TabPanel>

      <TabPanel active={tab} value="whatsapp">
      <div className="mb-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <ConnectionTestButton provider="WHATSAPP" label="Tes koneksi WhatsApp" />
      </div>
      <div className="rounded-xl border border-zinc-200 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-950">
              WhatsApp Inbox
            </h3>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Hubungkan WhatsApp Cloud API, WAHA, Woowa, Kirimi, StarSender, atau OneSender agar
              pesan masuk tampil di Inbox dan balasan bisa dikirim dari dashboard.
            </p>
          </div>
          <input
            type="hidden"
            value={String(whatsappIsActive)}
            {...register("whatsappIsActive")}
          />
          <Switch
            checked={whatsappIsActive}
            onCheckedChange={handleWhatsappToggle}
            disabled={!canEdit}
          />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="whatsappProvider">Provider</Label>
            <select
              id="whatsappProvider"
              disabled={!canEdit}
              className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              {...register("whatsappProvider")}
            >
              <option value="">Pilih provider</option>
              <option value="WABA">WhatsApp Cloud API (Meta)</option>
              <option value="WAHA">WAHA (self-hosted)</option>
              <option value="WOOWA">Woowa</option>
              <option value="KIRIMI">Kirimi</option>
              <option value="STARSENDER">StarSender</option>
              <option value="ONESENDER">OneSender</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsappSenderNumber">Nomor Pengirim</Label>
            <Input
              id="whatsappSenderNumber"
              placeholder="6281234567890"
              disabled={!canEdit}
              {...register("whatsappSenderNumber")}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="whatsappApiKey">API Key / Token</Label>
            <Input
              id="whatsappApiKey"
              type="password"
              placeholder={secretPlaceholder("whatsappApiKey", "Token dari provider WhatsApp")}
              disabled={!canEdit}
              {...register("whatsappApiKey")}
            />
            {storedSecretControl("whatsappApiKey")}
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsappPhoneNumberId">{waHints.idLabel}</Label>
            <Input
              id="whatsappPhoneNumberId"
              placeholder={waHints.idPlaceholder}
              disabled={!canEdit}
              {...register("whatsappPhoneNumberId")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsappApiBaseUrl">
              {waHints.baseUrlRequired ? "URL API" : "URL API (opsional)"}
            </Label>
            <Input
              id="whatsappApiBaseUrl"
              placeholder={waHints.baseUrlPlaceholder}
              disabled={!canEdit}
              {...register("whatsappApiBaseUrl")}
            />
            {errors.whatsappApiBaseUrl?.message ? (
              <p className="text-xs text-red-600">{errors.whatsappApiBaseUrl.message}</p>
            ) : null}
          </div>
          {watched.whatsappProvider === "KIRIMI" ? (
            <div className="space-y-2">
              <Label htmlFor="whatsappUserCode">User Code Kirimi</Label>
              <Input
                id="whatsappUserCode"
                placeholder="Kode akun dari dashboard Kirimi"
                disabled={!canEdit}
                {...register("whatsappUserCode")}
              />
            </div>
          ) : null}
          {waHints.note ? (
            <p className="rounded-lg bg-zinc-50 px-3 py-2 text-[11px] leading-5 text-zinc-500 md:col-span-2 dark:bg-zinc-900">
              {waHints.note}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="whatsappWebhookVerifyToken">
              Webhook Verify Token
            </Label>
            <Input
              id="whatsappWebhookVerifyToken"
              placeholder={secretPlaceholder("whatsappWebhookVerifyToken", "Token verifikasi webhook")}
              disabled={!canEdit}
              {...register("whatsappWebhookVerifyToken")}
            />
            {storedSecretControl("whatsappWebhookVerifyToken")}
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="whatsappWebhookSecret">Webhook Secret</Label>
            <Input
              id="whatsappWebhookSecret"
              type="password"
              placeholder={secretPlaceholder("whatsappWebhookSecret", "Wajib — App Secret Meta atau token rahasia gateway")}
              disabled={!canEdit}
              {...register("whatsappWebhookSecret")}
            />
            {storedSecretControl("whatsappWebhookSecret")}
            <p className="text-[11px] text-zinc-400">
              URL webhook: /api/inbox/whatsapp/webhook?workspaceId=WORKSPACE_ID
            </p>
            <p className="text-[11px] text-zinc-400">
              Pesan masuk ditolak tanpa secret ini. WhatsApp Cloud API memakai
              App Secret untuk tanda tangan; gateway lain mengirimnya lewat
              header <code>X-Webhook-Secret</code> atau parameter{" "}
              <code>&amp;secret=</code> di URL.
            </p>
          </div>
        </div>
      </div>
      </TabPanel>

      <TabPanel active={tab} value="script">
      <div className="space-y-2">
        <Label htmlFor="customHeadScript">Custom head script</Label>
        <Textarea
          id="customHeadScript"
          rows={6}
          spellCheck={false}
          disabled={!canEdit}
          placeholder="// Inline JS. Don't include <script> tags — My Landing wraps it for you."
          className="font-mono text-[12px]"
          {...register("customHeadScript")}
        />
        {errors.customHeadScript ? (
          <p className="text-xs text-red-600">
            {errors.customHeadScript.message}
          </p>
        ) : (
          <p className="text-[11px] text-zinc-400">
            Max 2000 characters. Injected on public site pages, never run in
            the dashboard. Keep it small and trusted.
          </p>
        )}
      </div>
      </TabPanel>

      {serverError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {serverError}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={!canEdit || pending || !isDirty}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {pending ? "Saving…" : "Save integrations"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Hidden rather than unmounted: the fields keep their values and the one save
 * button at the bottom still submits the whole form.
 */
function TabPanel({
  active,
  value,
  children,
}: {
  active: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div hidden={active !== value} className="space-y-5">
      {children}
    </div>
  );
}

function AdDeliveryPanel({
  title,
  platform,
  status,
  tokenMessage,
  onTest,
  testing,
  canTest,
}: {
  title: string;
  platform: string;
  status: AdDeliveryStatus;
  tokenMessage: string;
  onTest: () => void;
  testing: boolean;
  canTest: boolean;
}) {
  const hasFailures = status.failedToday > 0 || status.tokenErrors7d > 0;
  return (
    <div className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50/70 p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          {hasFailures ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-900">{title}</p>
            <p className="mt-1 break-words text-[11px] leading-5 text-zinc-500">
              {status.lastError
                ? status.lastError
                : `Belum ada kegagalan ${platform} tercatat.`}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 h-7 text-[11px]"
              onClick={onTest}
              disabled={!canTest || testing}
            >
              {testing ? <Loader2 className="animate-spin" /> : <Send />}
              Kirim event uji
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-right sm:grid-cols-4">
          <MetaCapiMetric label="Pending" value={status.pending} />
          <MetaCapiMetric label="Sent today" value={status.sentToday} />
          <MetaCapiMetric
            label="Failed today"
            value={status.failedToday}
            tone={status.failedToday > 0 ? "warn" : "default"}
          />
          <MetaCapiMetric label="Sent 7d" value={status.sent7d} />
        </div>
      </div>
      {status.tokenErrors7d > 0 ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
          {tokenMessage}
        </div>
      ) : null}
    </div>
  );
}

function MetaCapiMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warn";
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-2 py-1.5">
      <div
        className={
          tone === "warn"
            ? "text-sm font-semibold text-amber-700"
            : "text-sm font-semibold text-zinc-900"
        }
      >
        {value.toLocaleString("id-ID")}
      </div>
      <div className="text-[10px] font-medium uppercase text-zinc-400">
        {label}
      </div>
    </div>
  );
}

/** Field labels and setup notes that differ per WhatsApp provider. */
function whatsappProviderHints(provider: string) {
  switch (provider) {
    case "WABA":
      return {
        idLabel: "Phone Number ID",
        idPlaceholder: "ID nomor dari Meta Business Manager",
        baseUrlRequired: false,
        baseUrlPlaceholder: "https://graph.facebook.com",
        note: "API key = access token permanen (System User). Webhook Secret = App Secret aplikasi Meta.",
      };
    case "WAHA":
      return {
        idLabel: "Nama Session",
        idPlaceholder: "default",
        baseUrlRequired: true,
        baseUrlPlaceholder: "https://waha.tokoanda.com",
        note: "API key = WAHA_API_KEY server Anda. Untuk pesan masuk, set webhook session ke URL di bawah dengan event \"message\" dan isi hmac.key sama dengan Webhook Secret.",
      };
    case "WOOWA":
      return {
        idLabel: "Device ID (opsional)",
        idPlaceholder: "Tidak dipakai Woowa",
        baseUrlRequired: false,
        baseUrlPlaceholder: "https://notifapi.com",
        note: "API key = key dari dashboard Woowa. Isi URL API bila akun Anda memakai server/IP khusus.",
      };
    case "KIRIMI":
      return {
        idLabel: "Device ID",
        idPlaceholder: "ID device dari dashboard Kirimi",
        baseUrlRequired: false,
        baseUrlPlaceholder: "https://api.kirimi.id",
        note: "API key = secret akun Kirimi. Pesan dibatasi 1.200 karakter.",
      };
    case "ONESENDER":
      return {
        idLabel: "Device ID (opsional)",
        idPlaceholder: "Tidak wajib",
        baseUrlRequired: true,
        baseUrlPlaceholder: "https://onesender.tokoanda.com",
        note: "",
      };
    case "STARSENDER":
      return {
        idLabel: "Device ID (opsional)",
        idPlaceholder: "Tidak wajib",
        baseUrlRequired: false,
        baseUrlPlaceholder: "https://api.starsender.online",
        note: "",
      };
    default:
      return {
        idLabel: "Phone Number ID / Device ID",
        idPlaceholder: "Untuk WABA atau device provider",
        baseUrlRequired: false,
        baseUrlPlaceholder: "https://…",
        note: "",
      };
  }
}
