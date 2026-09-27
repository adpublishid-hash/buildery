import "server-only";

import { headers } from "next/headers";

import type { Prisma, PrismaClient } from "@prisma/client";

import { writeWorkspaceAudit } from "@/lib/workspace-audit";
import { reportError } from "@/lib/error-reporting";

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Field pengaturan yang menyimpan kredensial atau menentukan ke mana uang
 * mengalir. Nilainya tidak pernah masuk audit log — hanya namanya, supaya
 * riwayatnya bisa dibaca tanpa membocorkan rahasianya.
 */
export const SENSITIVE_SETTING_FIELDS = new Set<string>([
  // eCommerce
  "midtransServerKey",
  "midtransClientKey",
  "midtransEnabled",
  "midtransIsProduction",
  "rajaOngkirApiKey",
  "shippingAggregatorApiKey",
  // Integrasi
  "metaCapiAccessToken",
  "tiktokAccessToken",
  // Token CAPI / Events API pixel tambahan.
  "adPixelAccessToken",
  "googleAnalyticsApiSecret",
  "mailketingApiToken",
  "gmailClientId",
  "gmailClientSecret",
  "gmailRefreshToken",
  "telegramBotToken",
  "whatsappApiKey",
  "whatsappWebhookVerifyToken",
  "whatsappWebhookSecret",
  // Skrip yang disuntik ke seluruh halaman publik toko.
  "customHeadScript",
]);

/**
 * Nama field yang berubah antara baris tersimpan dan payload baru.
 *
 * Perbandingannya sengaja dangkal dan longgar: tujuannya adalah riwayat yang
 * bisa dibaca manusia ("siapa mengubah apa, kapan"), bukan diff yang presisi.
 */
export function changedSettingFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>
): string[] {
  const changed: string[] = [];
  for (const [key, value] of Object.entries(after)) {
    const previous = before?.[key];
    if (previous instanceof Date || value instanceof Date) {
      if (String(previous) !== String(value)) changed.push(key);
      continue;
    }
    if (Array.isArray(previous) || Array.isArray(value)) {
      if (JSON.stringify(previous ?? null) !== JSON.stringify(value ?? null)) {
        changed.push(key);
      }
      continue;
    }
    // null dan "" sama-sama berarti "kosong" di form ini; jangan laporkan
    // perubahan yang tidak dilihat siapa pun.
    const a = previous ?? null;
    const b = value ?? null;
    if (a !== b) changed.push(key);
  }
  return changed;
}

/** Konteks permintaan untuk audit. Aman dipanggil di luar request scope. */
function requestContext(): { ip: string | null; userAgent: string | null } {
  try {
    const h = headers();
    const forwarded = h.get("x-forwarded-for");
    return {
      ip: forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
      userAgent: h.get("user-agent"),
    };
  } catch {
    return { ip: null, userAgent: null };
  }
}

/**
 * Mencatat satu perubahan pengaturan.
 *
 * Mengganti nama workspace sudah tercatat sejak lama, tapi mengganti kunci
 * Midtrans, token WhatsApp, atau rekening tujuan transfer tidak — padahal
 * itulah perubahan yang paling perlu bisa ditelusuri kalau uang tiba-tiba
 * masuk ke tempat lain.
 *
 * Kegagalan audit tidak boleh menggagalkan penyimpanan yang sudah berhasil;
 * kegagalannya dilaporkan, bukan dilempar.
 */
export async function recordSettingsAudit(
  db: DbClient,
  input: {
    workspaceId: string;
    actorId: string | null;
    action: string;
    changedFields: string[];
    summary: string;
    targetType?: string;
    targetId?: string;
  }
): Promise<void> {
  const sensitive = input.changedFields.filter((field) =>
    SENSITIVE_SETTING_FIELDS.has(field)
  );
  const context = requestContext();

  try {
    await writeWorkspaceAudit(db, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: input.action,
      summary: input.summary,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: {
        changedFields: input.changedFields,
        sensitiveFields: sensitive,
        touchedCredentials: sensitive.length > 0,
      },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  } catch (error) {
    reportError("settings audit write failed", error);
  }
}

/** Ringkasan yang terbaca manusia untuk satu simpanan pengaturan. */
export function describeSettingsChange(
  label: string,
  changedFields: string[]
): string {
  if (changedFields.length === 0) return `${label} disimpan tanpa perubahan`;
  const sensitive = changedFields.filter((field) =>
    SENSITIVE_SETTING_FIELDS.has(field)
  );
  const head = changedFields.slice(0, 6).join(", ");
  const tail =
    changedFields.length > 6 ? ` +${changedFields.length - 6} lainnya` : "";
  return sensitive.length > 0
    ? `${label} diubah (termasuk kredensial): ${head}${tail}`
    : `${label} diubah: ${head}${tail}`;
}
