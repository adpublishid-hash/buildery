import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePublicPages } from "@/lib/public-page";
import { changedSettingFields, recordSettingsAudit } from "@/lib/settings-audit";
import { normalizeCode, pageAdvancedSchema } from "@/lib/page-advanced";

/**
 * Saves a page's pixel event and custom CSS from the builder.
 *
 * The event needs content.edit, like the rest of the page. The CSS needs
 * branding.edit, the permission that guards the workspace's own custom code;
 * an unchanged value never trips that check, so an editor can still save the
 * event on a page whose CSS an owner wrote.
 */
export async function PUT(req: Request, { params }: { params: { pageId: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Sesi berakhir. Silakan masuk lagi." }, { status: 401 });
  }

  const page = await prisma.page.findUnique({
    where: { id: params.pageId },
    select: {
      id: true,
      pixelEvent: true,
      customCss: true,
      website: { select: { workspaceId: true, workspace: { select: { slug: true } } } },
    },
  });
  const membership = page
    ? await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: { workspaceId: page.website.workspaceId, userId: session.user.id },
        },
        select: { role: true },
      })
    : null;
  if (!page || !membership || !canInWorkspace(membership.role, "content.edit")) {
    return NextResponse.json({ ok: false, error: "Tidak diizinkan." }, { status: 403 });
  }

  const parsed = pageAdvancedSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Periksa kembali isian.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const next: { pixelEvent?: string | null; customCss?: string | null } = {};
  if (parsed.data.pixelEvent !== undefined) next.pixelEvent = parsed.data.pixelEvent || null;
  if (parsed.data.customCss !== undefined) next.customCss = normalizeCode(parsed.data.customCss);

  const changed = changedSettingFields(page, next);
  if (changed.length === 0) return NextResponse.json({ ok: true });

  if (changed.includes("customCss") && !canInWorkspace(membership.role, "branding.edit")) {
    return NextResponse.json(
      {
        ok: false,
        error: "Hanya pemilik atau admin workspace yang boleh mengubah CSS kustom.",
        fieldErrors: { customCss: ["Butuh izin mengubah branding."] },
      },
      { status: 403 }
    );
  }

  await prisma.page.update({ where: { id: page.id }, data: next });

  await recordSettingsAudit(prisma, {
    workspaceId: page.website.workspaceId,
    actorId: session.user.id,
    action: "page.advanced.updated",
    changedFields: changed,
    summary: `Pengaturan lanjutan halaman diubah (${changed.join(", ")}).`,
    targetType: "page",
    targetId: page.id,
  });

  revalidatePublicPages(page.website.workspaceId);
  revalidatePath(`/site/${page.website.workspace.slug}`);
  revalidatePath(`/dashboard/pages/${page.id}/builder`);

  return NextResponse.json({ ok: true });
}
