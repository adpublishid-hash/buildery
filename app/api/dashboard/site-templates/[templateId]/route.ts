import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace";
import { getBuilderTemplateContent } from "@/lib/site-templates";
import { personalizeTemplateBlocks } from "@/lib/template-personalize";

/**
 * Isi satu template, sudah disesuaikan dengan workspace yang mengimpornya.
 *
 * Template bawaan disusun di kode dan template kustom disimpan di database,
 * jadi builder tidak bisa lagi menghitung bloknya sendiri di browser. Tombol
 * WhatsApp langsung diisi nomor bisnis workspace bila sudah diatur, dan tema
 * template ikut dikirim supaya builder bisa menawarkannya — bukan
 * menerapkannya diam-diam.
 */
export async function GET(
  _req: Request,
  { params }: { params: { templateId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sesi berakhir." },
      { status: 401 }
    );
  }

  const content = await getBuilderTemplateContent(
    decodeURIComponent(params.templateId)
  );
  if (!content) {
    return NextResponse.json(
      { ok: false, error: "Template tidak ditemukan." },
      { status: 404 }
    );
  }

  const current = await getCurrentWorkspace(session.user.id);
  const integration = current
    ? await prisma.integrationSetting.findUnique({
        where: { workspaceId: current.workspace.id },
        select: { whatsappSenderNumber: true },
      })
    : null;

  const personalized = personalizeTemplateBlocks(
    content.blocks,
    integration?.whatsappSenderNumber
  );

  return NextResponse.json({
    ok: true,
    data: {
      blocks: personalized.blocks,
      designTokens: content.designTokens,
      whatsapp: {
        replaced: personalized.replaced,
        remaining: personalized.remaining,
      },
    },
  });
}
