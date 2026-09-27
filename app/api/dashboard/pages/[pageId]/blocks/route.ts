import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { revalidatePublicPages } from "@/lib/public-page";

import { auth } from "@/lib/auth";
import { pageBlocksSchema } from "@/lib/blocks/schema";
import { loadEditableBuilderPage } from "@/lib/page-builder-access";
import { prunePageRevisions } from "@/lib/page-revisions";
import {
  extractSiteChrome,
  parseSiteChrome,
  planSiteChromeWrite,
  siteChromeFingerprint,
  type SiteChromeBase,
} from "@/lib/site-chrome";
import type { Block } from "@/lib/blocks/schema";
import { prisma } from "@/lib/prisma";

const REVISION_SOURCES = new Set(["AUTOSAVE", "MANUAL", "PUBLISH", "RESTORE"]);

export async function PUT(
  req: Request,
  { params }: { params: { pageId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Session expired. Please sign in again." },
      { status: 401 }
    );
  }

  const page = await loadEditableBuilderPage(params.pageId, session.user.id);
  if (!page) {
    return NextResponse.json(
      { ok: false, error: "Not allowed." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request payload." },
      { status: 400 }
    );
  }

  const rawBlocks =
    body && typeof body === "object" && "blocks" in body
      ? (body as { blocks: unknown }).blocks
      : body;
  const parsed = pageBlocksSchema.safeParse(rawBlocks);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Some blocks have invalid content." },
      { status: 400 }
    );
  }

  const rawVersion =
    body && typeof body === "object" && "version" in body
      ? (body as { version?: unknown }).version
      : undefined;
  if (!Number.isInteger(rawVersion) || Number(rawVersion) < 1) {
    return NextResponse.json(
      { ok: false, error: "A valid editor version is required." },
      { status: 400 }
    );
  }
  const rawSource =
    body && typeof body === "object" && "source" in body
      ? String((body as { source?: unknown }).source ?? "MANUAL")
      : "MANUAL";
  const source = REVISION_SOURCES.has(rawSource) ? rawSource : "MANUAL";
  const nextVersion = Number(rawVersion) + 1;

  const rawBase =
    body && typeof body === "object" && "siteChromeBase" in body
      ? (body as { siteChromeBase?: unknown }).siteChromeBase
      : undefined;
  const siteChromeBase: SiteChromeBase =
    rawBase && typeof rawBase === "object"
      ? {
          header:
            typeof (rawBase as SiteChromeBase).header === "string"
              ? (rawBase as SiteChromeBase).header
              : null,
          footer:
            typeof (rawBase as SiteChromeBase).footer === "string"
              ? (rawBase as SiteChromeBase).footer
              : null,
        }
      : {};
  let chromeConflicts: ("header" | "footer")[] = [];
  let nextBase: SiteChromeBase | null = null;

  const saved = await prisma.$transaction(async (tx) => {
    const claimed = await tx.page.updateMany({
      where: { id: page.id, editVersion: Number(rawVersion) },
      data: { editVersion: { increment: 1 }, updatedAt: new Date() },
    });
    if (claimed.count !== 1) return false;

    await tx.pageBlock.deleteMany({ where: { pageId: page.id } });
    if (parsed.data.length > 0) {
      await tx.pageBlock.createMany({
        data: parsed.data.map((block, index) => ({
          pageId: page.id,
          type: block.type,
          order: index,
          data: block.data,
        })),
      });
    }
    await tx.pageRevision.create({
      data: {
        pageId: page.id,
        version: nextVersion,
        source: source as "AUTOSAVE" | "MANUAL" | "PUBLISH" | "RESTORE",
        blocks: parsed.data,
        blockCount: parsed.data.length,
        createdById: session.user.id,
      },
    });
    await prunePageRevisions(tx, page.id);

    // Header/footer bertanda siteWide menulis balik ke versi situs, di
    // transaksi yang sama: kalau simpanan blok gagal, versi situs pun tidak
    // ikut berubah. Hanya bagian yang benar-benar diedit di halaman ini yang
    // ditulis, dan hanya kalau versi situs belum berubah sejak builder ini
    // memuatnya — autosave dari tab lama tidak boleh mengembalikan perubahan
    // yang dibuat dari halaman lain.
    const incoming = extractSiteChrome(parsed.data as Block[]);
    if (incoming.header || incoming.footer) {
      const website = await tx.website.findUnique({
        where: { id: page.websiteId },
        select: { siteHeader: true, siteFooter: true },
      });
      const plan = planSiteChromeWrite(
        incoming,
        parseSiteChrome(website ?? {}),
        siteChromeBase
      );
      chromeConflicts = plan.conflicts;
      if (plan.write.header || plan.write.footer) {
        await tx.website.update({
          where: { id: page.websiteId },
          data: {
            ...(plan.write.header ? { siteHeader: plan.write.header } : {}),
            ...(plan.write.footer ? { siteFooter: plan.write.footer } : {}),
          },
        });
      }
      nextBase = {
        header: plan.write.header
          ? siteChromeFingerprint(plan.write.header)
          : siteChromeBase.header ?? null,
        footer: plan.write.footer
          ? siteChromeFingerprint(plan.write.footer)
          : siteChromeBase.footer ?? null,
      };
    }
    return true;
  });

  if (!saved) {
    const current = await prisma.page.findUnique({
      where: { id: page.id },
      select: { editVersion: true, updatedAt: true },
    });
    return NextResponse.json(
      {
        ok: false,
        error: "This page was updated in another tab or by another editor.",
        code: "VERSION_CONFLICT",
        data: current,
      },
      { status: 409 }
    );
  }

  revalidatePath(`/dashboard/pages/${page.id}/builder`);
  revalidatePath(`/dashboard/pages/${page.id}/preview`);
  // The published page is served from a tagged cache; an edit has to drop it.
  revalidatePublicPages(page.website.workspaceId);

  return NextResponse.json({
    ok: true,
    data: {
      version: nextVersion,
      savedAt: new Date().toISOString(),
      // Versi dasar baru, dikirim balik di simpanan berikutnya.
      siteChromeBase: nextBase,
      siteChromeConflicts: chromeConflicts,
    },
  });
}
