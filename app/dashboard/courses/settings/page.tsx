import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { CourseCatalogSettingsForm } from "@/components/courses/course-catalog-settings-form";
import { createCourseCategoryAction } from "@/lib/actions/lms-admin";
import { Input } from "@/components/ui/input";
import { StorefrontSettingsCards } from "@/components/storefront/storefront-settings-cards";

export const metadata = { title: "Halaman kursus · My Landing" };

export default async function CourseCatalogSettingsPage() {
  const { workspace, role } = await requireCurrentWorkspace();
  const canEdit = canInWorkspace(role, "content.edit");

  const [setting, categories] = await Promise.all([
    prisma.lmsSetting.findUnique({ where: { workspaceId: workspace.id } }),
    prisma.courseCategory.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHeader
        title="Halaman kursus"
        description="Atur teks halaman katalog dan detail kursus publik."
        action={
          <Button variant="outline" asChild>
            <Link href="/dashboard/courses">
              <ArrowLeft /> Kursus
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Halaman katalog kursus</CardTitle>
          <CardDescription>
            Teks hero di atas daftar kursus publik.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CourseCatalogSettingsForm
            workspaceName={workspace.name}
            canEdit={canEdit}
            initial={{
              catalogEyebrow: setting?.catalogEyebrow ?? "",
              catalogHeading: setting?.catalogHeading ?? "",
              catalogSubheading: setting?.catalogSubheading ?? "",
            }}
          />
        </CardContent>
      </Card>

      <StorefrontSettingsCards
        workspaceId={workspace.id}
        canEdit={canEdit}
        pageKeys={["courses_single"]}
      />

      <Card>
        <CardHeader><CardTitle>Course categories</CardTitle><CardDescription>Categories power catalog filters and course discovery.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {canEdit ? <form action={async (data) => { "use server"; await createCourseCategoryAction(data); }} className="flex gap-2"><Input name="name" placeholder="Marketing" required /><Button type="submit">Add category</Button></form> : null}
          <div className="flex flex-wrap gap-2">{categories.map((item) => <span key={item.id} className="rounded-md border border-zinc-200 px-2 py-1 text-sm">{item.name}</span>)}</div>
        </CardContent>
      </Card>
    </div>
  );
}
