"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireWorkspacePermission } from "@/lib/workspace";
import { builderDesignTokensSchema } from "@/lib/builder-design-tokens";
import { revalidatePublicPages } from "@/lib/public-page";
import {
  changedSettingFields,
  describeSettingsChange,
  recordSettingsAudit,
} from "@/lib/settings-audit";

type ActionResult =
  | { ok: true; data?: { websites: number } }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Menyimpan token desain untuk seluruh situs milik workspace.
 *
 * Token ini berlaku situs-lebar. Sebelumnya satu-satunya cara mengubahnya
 * adalah dialog di dalam builder satu halaman, lewat route yang di-scope ke
 * halaman — sehingga mengganti warna saat menggarap satu landing page
 * diam-diam merestyle semua halaman lain tanpa peringatan apa pun.
 */
export async function updateThemeTokensAction(
  formData: FormData
): Promise<ActionResult> {
  const { workspace, user } = await requireWorkspacePermission("branding.edit");

  const parsed = builderDesignTokensSchema.safeParse({
    accentColor: formData.get("accentColor"),
    backgroundColor: formData.get("backgroundColor"),
    textColor: formData.get("textColor"),
    headingFont: formData.get("headingFont"),
    bodyFont: formData.get("bodyFont"),
    radius: formData.get("radius"),
    spacing: formData.get("spacing") ?? undefined,
    containerWidth: formData.get("containerWidth") ?? undefined,
    colorScheme: formData.get("colorScheme") ?? undefined,
    darkBackgroundColor: formData.get("darkBackgroundColor") ?? undefined,
    darkSurfaceColor: formData.get("darkSurfaceColor") ?? undefined,
    darkTextColor: formData.get("darkTextColor") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Periksa kembali isian yang ditandai.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const websites = await prisma.website.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, designTokens: true },
  });
  if (websites.length === 0) {
    return {
      ok: false,
      error: "Belum ada situs di workspace ini. Buat halaman dulu.",
    };
  }

  await prisma.website.updateMany({
    where: { workspaceId: workspace.id },
    data: { designTokens: parsed.data },
  });

  const changedFields = changedSettingFields(
    (websites[0].designTokens as Record<string, unknown>) ?? null,
    parsed.data
  );
  await recordSettingsAudit(prisma, {
    workspaceId: workspace.id,
    actorId: user.id,
    action: "settings.theme.tokens_updated",
    changedFields,
    summary: describeSettingsChange("Tema situs", changedFields),
    targetType: "website",
  });

  revalidatePublicPages(workspace.id);
  revalidatePath("/dashboard/theme");
  revalidatePath(`/site/${workspace.slug}`);
  return { ok: true, data: { websites: websites.length } };
}
