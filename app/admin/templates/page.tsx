import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { TemplatesManager } from "@/components/admin/templates-manager";
import {
  TemplateFromPageDialog,
  type TemplateSourcePage,
} from "@/components/admin/template-from-page-dialog";

export const metadata = { title: "Templates · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminTemplatesPage() {
  await requireSuperAdmin();

  const [templates, pages] = await Promise.all([
    prisma.siteTemplate.findMany({ orderBy: { createdAt: "desc" } }),
    // Kandidat sumber template: halaman yang benar-benar punya block.
    prisma.page.findMany({
      where: { blocks: { some: {} } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        slug: true,
        _count: { select: { blocks: true } },
        website: {
          select: { name: true, workspace: { select: { name: true } } },
        },
      },
    }),
  ]);

  const sourcePages: TemplateSourcePage[] = pages.map((page) => ({
    id: page.id,
    label: `${page.website.workspace.name} · ${page.title || page.slug}`,
    blockCount: page._count.blocks,
  }));

  const emptyPublished = templates.filter(
    (template) => template.isPublished && template.blockCount === 0
  ).length;

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Website templates"
        description="Template yang bisa dipilih pemilik workspace di builder."
        action={<TemplateFromPageDialog pages={sourcePages} />}
      />

      {emptyPublished > 0 ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {emptyPublished} template terbit tapi belum punya block, jadi tidak
          muncul di builder. Buat ulang dari sebuah halaman.
        </p>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          <TemplatesManager templates={templates} />
        </CardContent>
      </Card>
    </div>
  );
}
