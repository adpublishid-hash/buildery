"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { clientIpFrom } from "@/lib/ad-events";
import { describeAdSendFailure, isUniqueConstraintError } from "@/lib/ad-event-queue";
import { CLEAR_AD_PIXEL_TOKEN as CLEAR_TOKEN } from "@/lib/ad-pixel-constants";
import { AD_PIXEL_LIMIT, clearExtraPixelCache } from "@/lib/ad-pixels";
import { clearMetaCapiConfigCache, sendMetaCapiEvent } from "@/lib/meta-capi";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { publicSiteHref } from "@/lib/public-url";
import { rateLimitShared } from "@/lib/rate-limit";
import { recordSettingsAudit } from "@/lib/settings-audit";
import { buildTikTokEventPayload, clearTikTokConfigCache, sendTikTokEventsBatch } from "@/lib/tiktok-events";
import { getCurrentWorkspace } from "@/lib/workspace";

type ActionResult = { ok: true; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const PIXEL_FORMAT = {
  META: { pattern: /^\d{6,30}$/, hint: "Meta Pixel ID berupa 6–30 digit angka." },
  TIKTOK: { pattern: /^[A-Z0-9]{10,40}$/i, hint: "TikTok Pixel ID berupa 10–40 huruf/angka." },
} as const;


const pixelSchema = z.object({
  id: z.string().optional(),
  provider: z.enum(["META", "TIKTOK"]),
  pixelId: z.string().trim().min(1, "Pixel ID wajib diisi").max(40),
  label: z.string().trim().max(60).optional(),
  serverEnabled: z.boolean(),
  /** "" keeps the stored token, CLEAR_TOKEN removes it. */
  accessToken: z.string().trim().max(1000),
  testEventCode: z.string().trim().max(60).optional(),
  isActive: z.boolean(),
});

async function authorize() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = await getCurrentWorkspace(session.user.id);
  // Same permission as the primary pixel and its token.
  if (!current || !canInWorkspace(current.role, "branding.edit")) return null;
  return { userId: session.user.id, workspaceId: current.workspace.id, slug: current.workspace.slug };
}

function afterChange(workspaceId: string) {
  clearExtraPixelCache(workspaceId);
  clearMetaCapiConfigCache(workspaceId);
  clearTikTokConfigCache(workspaceId);
  revalidatePath("/dashboard/settings/integrations");
}

export async function saveAdPixelAction(input: z.input<typeof pixelSchema>): Promise<ActionResult> {
  const ctx = await authorize();
  if (!ctx) return { ok: false, error: "Tidak diizinkan." };

  const limit = await rateLimitShared(`settings:ad-pixels:${ctx.userId}`, 30, 5 * 60 * 1000);
  if (!limit.ok) return { ok: false, error: "Terlalu sering menyimpan. Coba lagi sebentar lagi." };

  const parsed = pixelSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Periksa kembali isian.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;
  if (!PIXEL_FORMAT[data.provider].pattern.test(data.pixelId)) {
    return { ok: false, error: PIXEL_FORMAT[data.provider].hint, fieldErrors: { pixelId: [PIXEL_FORMAT[data.provider].hint] } };
  }

  const [existing, integration, count] = await Promise.all([
    data.id
      ? prisma.adPixel.findFirst({ where: { id: data.id, workspaceId: ctx.workspaceId } })
      : Promise.resolve(null),
    prisma.integrationSetting.findUnique({
      where: { workspaceId: ctx.workspaceId },
      select: { metaPixelId: true, tiktokPixelId: true },
    }),
    prisma.adPixel.count({ where: { workspaceId: ctx.workspaceId, provider: data.provider } }),
  ]);
  if (data.id && !existing) return { ok: false, error: "Pixel tidak ditemukan." };
  if (!data.id && count >= AD_PIXEL_LIMIT) {
    return { ok: false, error: `Maksimal ${AD_PIXEL_LIMIT} pixel tambahan per platform.` };
  }
  const primary = data.provider === "META" ? integration?.metaPixelId : integration?.tiktokPixelId;
  if (primary && primary === data.pixelId) {
    return { ok: false, error: "Ini sudah pixel utama.", fieldErrors: { pixelId: ["Sama dengan pixel utama."] } };
  }

  const nextToken =
    data.accessToken === CLEAR_TOKEN ? null : data.accessToken ? data.accessToken : existing?.accessToken ?? null;
  if (data.serverEnabled && !nextToken) {
    const field = data.provider === "META" ? "access token CAPI" : "access token Events API";
    return { ok: false, error: `Isi ${field} untuk mengirim event dari server.`, fieldErrors: { accessToken: ["Wajib bila pengiriman server aktif."] } };
  }

  const values = {
    pixelId: data.pixelId,
    label: data.label || null,
    serverEnabled: data.serverEnabled,
    accessToken: nextToken,
    testEventCode: data.testEventCode || null,
    isActive: data.isActive,
  };

  let savedId: string;
  try {
    if (existing) {
      await prisma.adPixel.update({ where: { id: existing.id }, data: values });
      savedId = existing.id;
    } else {
      const created = await prisma.adPixel.create({
        data: { ...values, workspaceId: ctx.workspaceId, provider: data.provider },
        select: { id: true },
      });
      savedId = created.id;
    }
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false, error: "Pixel ini sudah ada di daftar.", fieldErrors: { pixelId: ["Sudah terdaftar."] } };
    }
    throw error;
  }

  // Which fields changed, never their values; the token only by its presence.
  const changed = existing
    ? [
        ...(["pixelId", "label", "serverEnabled", "testEventCode", "isActive"] as const).filter(
          (key) => (existing[key] ?? null) !== (values[key] ?? null)
        ),
        ...(data.accessToken ? ["adPixelAccessToken"] : []),
      ]
    : ["pixelId", ...(nextToken ? ["adPixelAccessToken"] : [])];
  await recordSettingsAudit(prisma, {
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: existing ? "settings.adPixel.updated" : "settings.adPixel.created",
    changedFields: changed,
    summary: `${existing ? "Mengubah" : "Menambah"} ${data.provider === "META" ? "Meta" : "TikTok"} Pixel tambahan ${data.pixelId}.`,
    targetType: "adPixel",
    targetId: savedId,
  });

  afterChange(ctx.workspaceId);
  return { ok: true };
}

export async function deleteAdPixelAction(id: string): Promise<ActionResult> {
  const ctx = await authorize();
  if (!ctx) return { ok: false, error: "Tidak diizinkan." };
  const pixel = await prisma.adPixel.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!pixel) return { ok: false, error: "Pixel tidak ditemukan." };

  // Its queued events are dropped at the next flush: the queue finds no
  // config for the pixel and discards what was waiting for it.
  await prisma.adPixel.delete({ where: { id: pixel.id } });
  await recordSettingsAudit(prisma, {
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: "settings.adPixel.deleted",
    changedFields: ["pixelId"],
    summary: `Menghapus ${pixel.provider === "META" ? "Meta" : "TikTok"} Pixel tambahan ${pixel.pixelId}.`,
    targetType: "adPixel",
    targetId: pixel.id,
  });
  afterChange(ctx.workspaceId);
  return { ok: true };
}

/**
 * Sends one test event to a single extra pixel with its stored token and test
 * code, like the primary pixel's test button.
 */
export async function sendAdPixelTestAction(id: string): Promise<ActionResult> {
  const ctx = await authorize();
  if (!ctx) return { ok: false, error: "Tidak diizinkan." };
  const pixel = await prisma.adPixel.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!pixel) return { ok: false, error: "Pixel tidak ditemukan." };
  if (!pixel.accessToken) return { ok: false, error: "Simpan access token pixel ini dulu." };
  if (!pixel.testEventCode) {
    return { ok: false, error: "Isi dan simpan Test Event Code dulu, supaya tes tidak terhitung sebagai event asli." };
  }

  const session = await auth();
  const h = headers();
  const common = {
    eventId: `test:${randomUUID()}`,
    sourceUrl: publicSiteHref(ctx.slug, ""),
    clientIp: clientIpFrom(h.get("x-real-ip"), h.get("x-forwarded-for")),
    userAgent: h.get("user-agent"),
    customerData: { email: session?.user?.email ?? null, externalId: ctx.userId },
  };

  if (pixel.provider === "META") {
    const result = await sendMetaCapiEvent({
      ...common,
      pixelId: pixel.pixelId,
      accessToken: pixel.accessToken,
      testEventCode: pixel.testEventCode,
      eventName: "PageView",
    });
    return result.ok
      ? { ok: true, message: `Meta menerima event uji untuk pixel ${pixel.pixelId}. Cek tab Test Events.` }
      : { ok: false, error: `Meta menolak: ${describeAdSendFailure(result)}` };
  }

  const payload = buildTikTokEventPayload({ ...common, eventName: "ViewContent" });
  if (!payload) return { ok: false, error: "Event uji tidak didukung." };
  const result = await sendTikTokEventsBatch(
    { pixelId: pixel.pixelId, accessToken: pixel.accessToken, testEventCode: pixel.testEventCode },
    [payload]
  );
  return result.ok
    ? { ok: true, message: `TikTok menerima event uji untuk pixel ${pixel.pixelId}. Cek Test Events.` }
    : { ok: false, error: `TikTok menolak: ${describeAdSendFailure(result)}` };
}
