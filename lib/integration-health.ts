import "server-only";

import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/error-reporting";

/**
 * Tes koneksi untuk kredensial non-iklan.
 *
 * Meta, TikTok, dan GA4 sudah punya tombol kirim event tes. Midtrans, email,
 * Telegram, dan WhatsApp tidak — sehingga kredensial yang salah baru ketahuan
 * saat order pertama gagal atau email pertama tidak pernah sampai.
 *
 * Setiap tes memakai panggilan paling murah yang tetap membuktikan kredensial
 * diterima, dan tidak satu pun mengirim pesan ke pelanggan.
 */

export type ConnectionTestProvider =
  | "MIDTRANS"
  | "MAILKETING"
  | "GMAIL"
  | "TELEGRAM"
  | "WHATSAPP";

export type ConnectionTestResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const TIMEOUT_MS = 8000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError") return "Tidak ada jawaban dalam 8 detik.";
    return error.message.slice(0, 200);
  }
  return "Gagal menghubungi layanan.";
}

export async function testIntegrationConnection(
  workspaceId: string,
  provider: ConnectionTestProvider
): Promise<ConnectionTestResult> {
  try {
    switch (provider) {
      case "MIDTRANS":
        return await testMidtrans(workspaceId);
      case "MAILKETING":
        return await testMailketing(workspaceId);
      case "GMAIL":
        return await testGmail(workspaceId);
      case "TELEGRAM":
        return await testTelegram(workspaceId);
      case "WHATSAPP":
        return await testWhatsApp(workspaceId);
    }
  } catch (error) {
    reportError(`integration connection test failed: ${provider}`, error);
    return { ok: false, error: describe(error) };
  }
}

/**
 * Menanyakan status satu order yang pasti tidak ada.
 *
 * Kunci yang benar menjawab 404 "tidak ditemukan"; kunci yang salah menjawab
 * 401. Keduanya membuktikan hal yang ingin kita ketahui tanpa membuat
 * transaksi apa pun.
 */
async function testMidtrans(workspaceId: string): Promise<ConnectionTestResult> {
  const setting = await prisma.ecommerceSetting.findUnique({
    where: { workspaceId },
    select: {
      midtransServerKey: true,
      midtransIsProduction: true,
      midtransEnabled: true,
    },
  });
  const serverKey = setting?.midtransServerKey?.trim();
  if (!serverKey) {
    return { ok: false, error: "Server key Midtrans belum diisi." };
  }

  const base = setting?.midtransIsProduction
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";
  const auth = Buffer.from(`${serverKey}:`).toString("base64");
  const res = await fetchWithTimeout(
    `${base}/v2/buildery-connection-test-000/status`,
    { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } }
  );

  const mode = setting?.midtransIsProduction ? "produksi" : "sandbox";
  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      error: `Server key ditolak Midtrans (${mode}). Pastikan key cocok dengan mode yang dipilih.`,
    };
  }
  if (res.status === 404 || res.ok) {
    const note = setting?.midtransEnabled
      ? ""
      : " Catatan: Midtrans masih dinonaktifkan di pengaturan.";
    return { ok: true, message: `Server key diterima Midtrans (${mode}).${note}` };
  }
  return { ok: false, error: `Midtrans menjawab HTTP ${res.status}.` };
}

async function testMailketing(
  workspaceId: string
): Promise<ConnectionTestResult> {
  const setting = await prisma.integrationSetting.findUnique({
    where: { workspaceId },
    select: {
      mailketingApiToken: true,
      mailketingSenderEmail: true,
      mailketingSenderName: true,
    },
  });
  const token = setting?.mailketingApiToken?.trim();
  if (!token) return { ok: false, error: "API token Mailketing belum diisi." };
  if (!setting?.mailketingSenderEmail || !setting?.mailketingSenderName) {
    return {
      ok: false,
      error: "Nama dan email pengirim Mailketing wajib diisi.",
    };
  }

  // Mailketing tidak punya endpoint ping, jadi kirim permintaan yang sengaja
  // tidak lengkap: token yang salah ditolak sebelum isi pesan diperiksa.
  const res = await fetchWithTimeout("https://api.mailketing.co.id/api/v1/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_token: token }),
  });
  const body = (await res.text().catch(() => "")).toLowerCase();

  if (res.status === 401 || res.status === 403 || body.includes("invalid token")) {
    return { ok: false, error: "API token Mailketing ditolak." };
  }
  if (!res.ok && res.status >= 500) {
    return { ok: false, error: `Mailketing menjawab HTTP ${res.status}.` };
  }
  return {
    ok: true,
    message: "Mailketing menerima token. Pengirim sudah lengkap.",
  };
}

/** Menukar refresh token dengan access token — bukti paling langsung. */
async function testGmail(workspaceId: string): Promise<ConnectionTestResult> {
  const setting = await prisma.integrationSetting.findUnique({
    where: { workspaceId },
    select: {
      gmailClientId: true,
      gmailClientSecret: true,
      gmailRefreshToken: true,
      gmailSenderEmail: true,
    },
  });
  if (
    !setting?.gmailClientId ||
    !setting?.gmailClientSecret ||
    !setting?.gmailRefreshToken
  ) {
    return {
      ok: false,
      error: "Client ID, client secret, dan refresh token Gmail wajib lengkap.",
    };
  }

  const res = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: setting.gmailClientId,
      client_secret: setting.gmailClientSecret,
      refresh_token: setting.gmailRefreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json().catch(() => null)) as
    | { access_token?: string; error?: string; error_description?: string }
    | null;

  if (!res.ok || !json?.access_token) {
    return {
      ok: false,
      error: `Gmail menolak kredensial: ${
        json?.error_description || json?.error || `HTTP ${res.status}`
      }`,
    };
  }
  return {
    ok: true,
    message: `Gmail OAuth valid untuk ${setting.gmailSenderEmail ?? "akun terhubung"}.`,
  };
}

/** getMe memvalidasi token bot tanpa mengirim pesan ke siapa pun. */
async function testTelegram(
  workspaceId: string
): Promise<ConnectionTestResult> {
  const setting = await prisma.integrationSetting.findUnique({
    where: { workspaceId },
    select: { telegramBotToken: true, telegramChatId: true },
  });
  const token = setting?.telegramBotToken?.trim();
  if (!token) return { ok: false, error: "Bot token Telegram belum diisi." };

  const res = await fetchWithTimeout(
    `https://api.telegram.org/bot${token}/getMe`
  );
  const json = (await res.json().catch(() => null)) as
    | { ok?: boolean; result?: { username?: string }; description?: string }
    | null;

  if (!res.ok || !json?.ok) {
    return {
      ok: false,
      error: `Telegram menolak token: ${json?.description ?? `HTTP ${res.status}`}`,
    };
  }
  if (!setting?.telegramChatId) {
    return {
      ok: false,
      error: `Bot @${json.result?.username ?? "?"} valid, tapi chat ID belum diisi jadi notifikasi tidak akan terkirim.`,
    };
  }
  return {
    ok: true,
    message: `Terhubung sebagai @${json.result?.username ?? "bot"}.`,
  };
}

async function testWhatsApp(
  workspaceId: string
): Promise<ConnectionTestResult> {
  const setting = await prisma.integrationSetting.findUnique({
    where: { workspaceId },
    select: {
      whatsappProvider: true,
      whatsappApiKey: true,
      whatsappPhoneNumberId: true,
      whatsappGraphVersion: true,
      whatsappApiBaseUrl: true,
      whatsappIsActive: true,
    },
  });
  if (!setting?.whatsappProvider) {
    return { ok: false, error: "Provider WhatsApp belum dipilih." };
  }
  const key = setting.whatsappApiKey?.trim();
  if (!key) return { ok: false, error: "API key WhatsApp belum diisi." };

  if (setting.whatsappProvider === "WABA") {
    if (!setting.whatsappPhoneNumberId) {
      return { ok: false, error: "Phone number ID wajib diisi untuk WABA." };
    }
    const version = setting.whatsappGraphVersion || "v25.0";
    const base = setting.whatsappApiBaseUrl || "https://graph.facebook.com";
    const res = await fetchWithTimeout(
      `${base.replace(/\/+$/, "")}/${version}/${setting.whatsappPhoneNumberId}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${key}` } }
    );
    const json = (await res.json().catch(() => null)) as
      | {
          display_phone_number?: string;
          verified_name?: string;
          error?: { message?: string };
        }
      | null;

    if (!res.ok) {
      return {
        ok: false,
        error: `WhatsApp Business API menolak: ${
          json?.error?.message ?? `HTTP ${res.status}`
        }`,
      };
    }
    return {
      ok: true,
      message: `Terhubung ke ${json?.verified_name ?? "nomor"} (${
        json?.display_phone_number ?? setting.whatsappPhoneNumberId
      }).`,
    };
  }

  // ONESENDER dan STARSENDER adalah gateway dengan base URL sendiri; tanpa itu
  // tidak ada yang bisa dihubungi.
  if (!setting.whatsappApiBaseUrl) {
    return {
      ok: false,
      error:
        "Base URL API WhatsApp belum diisi, jadi koneksi tidak bisa diuji dari sini.",
    };
  }
  const res = await fetchWithTimeout(setting.whatsappApiBaseUrl, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "API key WhatsApp ditolak penyedia." };
  }
  return {
    ok: true,
    message: `Penyedia menjawab HTTP ${res.status}. Kredensial tidak ditolak.`,
  };
}
