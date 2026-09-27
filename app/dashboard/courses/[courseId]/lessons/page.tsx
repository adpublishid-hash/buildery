import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { LessonType } from "@prisma/client";
import { Layers } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { parseLessonContent } from "@/lib/lms";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  FlatLessonsList,
  type FlatLessonRow,
} from "@/components/courses/flat-lessons-list";

export const metadata = { title: "Lessons · My Landing" };

export default async function CourseLessonsListPage({
  params,
}: {
  params: { courseId: string };
}) {
  const { workspace, role } = await requireCurrentWorkspace();
  if (!canInWorkspace(role, "content.edit")) {
    redirect("/dashboard/courses");
  }

  const course = await prisma.course.findUnique({
    where: { id: params.courseId },
    select: { id: true, workspaceId: true },
  });
  if (!course || course.workspaceId !== workspace.id) notFound();

  const modules = await prisma.courseModule.findMany({
    where: { courseId: course.id },
    include: { lessons: { include: { asset: true }, orderBy: { order: "asc" } } },
    orderBy: { order: "asc" },
  });

  const lessons: FlatLessonRow[] = modules.flatMap((m) =>
    m.lessons.map((l) => {
      const content = parseLessonContent(l.type as LessonType, l.content);
      return {
        id: l.id,
        title: l.title,
        type: l.type,
        moduleTitle: m.title,
        isPreview: l.isPreview,
        dripDays: l.dripDays,
        defaultValues: {
          title: l.title,
          type: l.type,
          body: "body" in content ? content.body : "",
          url: "url" in content ? content.url : "",
          label: "label" in content ? content.label : "Open link",
          isPreview: l.isPreview,
          dripEnabled: l.dripDays != null,
          dripDays: l.dripDays != null ? String(l.dripDays) : "",
          durationMinutes: String(l.durationMinutes),
          transcript: l.transcript ?? "",
          assetId: l.asset?.id ?? "",
          assetName: l.asset?.name ?? "",
          assetKind: l.asset?.kind ?? "",
          assetSize: l.asset?.size ?? 0,
          attachmentLabel: l.attachmentLabel ?? "",
          prerequisiteLessonId: l.prerequisiteLessonId ?? "",
        },
      };
    })
  );

  if (lessons.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No lessons yet"
        description="Add modules and lessons in the curriculum tab."
        action={
          <Button asChild>
            <Link href={`/dashboard/courses/${course.id}/modules`}>
              Edit curriculum
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <FlatLessonsList lessons={lessons} courseId={course.id} />
      </CardContent>
    </Card>
  );
}
