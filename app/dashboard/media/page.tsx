import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/dashboard/page-header";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { MediaGrid, type MediaItem } from "@/components/media/media-grid";

export const metadata = { title: "Media · My Landing" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

/**
 * Pustaka media workspace.
 *
 * Sebelumnya berkas yang diunggah hanya bertambah tanpa satu pun halaman untuk
 * menelusuri, memakai ulang, atau menghapusnya — mengunggah gambar yang sama
 * ke tiga halaman menghasilkan tiga berkas, dan tidak ada yang bisa dibersihkan.
 */
export default async function MediaPage({
  searchParams,
}: {
  searchParams?: { page?: string };
}) {
  const { workspace, role } = await requireCurrentWorkspace();
  const page = parsePage(searchParams?.page);
  const canEdit = canInWorkspace(role, "content.edit");

  const [uploads, total, totals] = await Promise.all([
    prisma.uploadFile.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        url: true,
        name: true,
        size: true,
        mimeType: true,
        createdAt: true,
      },
    }),
    prisma.uploadFile.count({ where: { workspaceId: workspace.id } }),
    prisma.uploadFile.aggregate({
      where: { workspaceId: workspace.id },
      _sum: { size: true },
    }),
  ]);

  const items: MediaItem[] = uploads.map((upload) => ({
    id: upload.id,
    url: upload.url,
    name: upload.name,
    size: upload.size ?? 0,
    mimeType: upload.mimeType ?? "image",
    createdAt: upload.createdAt.toISOString(),
  }));

  const totalMb = (totals._sum.size ?? 0) / (1024 * 1024);

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Media"
        description={`${total} berkas · ${totalMb.toFixed(1)} MB. Berkas yang masih dipakai konten mana pun tidak bisa dihapus.`}
      />

      <MediaGrid items={items} canEdit={canEdit} />

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        basePath="/dashboard/media"
      />
    </div>
  );
}
