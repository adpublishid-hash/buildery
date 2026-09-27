import "server-only";

import { unlink } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/error-reporting";

/**
 * Menghitung berapa baris yang menyebut satu URL di dalam kolom JSON.
 *
 * Gambar di builder tersimpan sebagai URL di dalam JSON blok, bukan sebagai
 * relasi, jadi tidak ada cara mengeceknya lewat Prisma selain pencarian teks.
 * Kegagalan diperlakukan sebagai "masih dipakai": menahan berkas yang
 * sebenarnya yatim jauh lebih murah daripada menghapus gambar yang masih
 * tayang.
 */
async function countJsonReferences(
  sql: string,
  workspaceId: string,
  url: string
): Promise<number> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ count: number }[]>(
      sql,
      workspaceId,
      `%${url}%`
    );
    return Number(rows[0]?.count ?? 0);
  } catch (error) {
    reportError("upload reference scan failed", error);
    return 1;
  }
}

export async function deleteOrphanUpload(uploadId: string | null | undefined) {
  if (!uploadId) return false;
  const upload = await prisma.uploadFile.findUnique({
    where: { id: uploadId },
    include: {
      _count: {
        select: {
          products: true,
          courseImages: true,
          blogImages: true,
          variantImages: true,
        },
      },
    },
  });
  if (!upload?.workspaceId) return false;
  if (Object.values(upload._count).some((count) => count > 0)) return false;

  const [draftBodyUse, versionUse, pageUse, revisionUse, sectionUse, templateUse] =
    await Promise.all([
      prisma.blogPost.count({
        where: { workspaceId: upload.workspaceId, body: { contains: upload.url } },
      }),
      prisma.blogPostVersion.count({
        where: {
          post: { workspaceId: upload.workspaceId },
          OR: [{ imageUrl: upload.url }, { body: { contains: upload.url } }],
        },
      }),
      // Blok halaman menyimpan URL gambar di dalam JSON-nya, bukan sebagai
      // relasi. Tanpa pemeriksaan ini, membersihkan berkas justru menghapus
      // gambar yang masih dipakai landing page yang sedang tayang.
      countJsonReferences(
        `SELECT COUNT(*)::int AS count FROM "PageBlock" b
           JOIN "Page" p ON p."id" = b."pageId"
           JOIN "Website" w ON w."id" = p."websiteId"
          WHERE w."workspaceId" = $1 AND b."data"::text LIKE $2`,
        upload.workspaceId,
        upload.url
      ),
      // Revisi memegang salinan blok; menghapus berkasnya membuat rollback
      // mengembalikan halaman dengan gambar yang sudah hilang.
      countJsonReferences(
        `SELECT COUNT(*)::int AS count FROM "PageRevision" r
           JOIN "Page" p ON p."id" = r."pageId"
           JOIN "Website" w ON w."id" = p."websiteId"
          WHERE w."workspaceId" = $1 AND r."blocks"::text LIKE $2`,
        upload.workspaceId,
        upload.url
      ),
      countJsonReferences(
        `SELECT COUNT(*)::int AS count FROM "SavedSection"
          WHERE "workspaceId" = $1 AND "blocks"::text LIKE $2`,
        upload.workspaceId,
        upload.url
      ),
      // Template situs dipakai lintas workspace, jadi dicek tanpa filter
      // workspace.
      countJsonReferences(
        `SELECT COUNT(*)::int AS count FROM "SiteTemplate"
          WHERE $1 = $1 AND "blocks"::text LIKE $2`,
        upload.workspaceId,
        upload.url
      ),
    ]);
  if (
    draftBodyUse ||
    versionUse ||
    pageUse ||
    revisionUse ||
    sectionUse ||
    templateUse
  ) {
    return false;
  }

  const deleted = await prisma.uploadFile
    .delete({ where: { id: upload.id } })
    .catch(() => null);
  if (!deleted) return false;
  const prefix = `/uploads/${upload.workspaceId}/`;
  if (upload.url.startsWith(prefix)) {
    const publicRoot = path.join(process.cwd(), "public");
    const absolute = path.resolve(publicRoot, upload.url.slice(1));
    const uploadRoot = path.resolve(publicRoot, "uploads");
    if (absolute.startsWith(`${uploadRoot}${path.sep}`)) {
      await unlink(absolute).catch(() => {});
    }
  }
  return true;
}
