import { notFound, redirect } from "next/navigation";
import type { LessonType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { parseLessonContent } from "@/lib/lms";
import {
  CurriculumEditor,
  type LessonRow,
  type ModuleRow,
} from "@/components/courses/curriculum-editor";

export const metadata = { title: "Curriculum · My Landing" };

export default async function CourseCurriculumPage({
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

  const moduleRows: ModuleRow[] = modules.map((m) => ({
    id: m.id,
    title: m.title,
    lessons: m.lessons.map((l): LessonRow => {
      const content = parseLessonContent(l.type as LessonType, l.content);
      return {
        id: l.id,
        title: l.title,
        type: l.type,
        isPreview: l.isPreview,
        dripDays: l.dripDays,
        durationMinutes: l.durationMinutes,
        transcript: l.transcript,
        asset: l.asset ? { id: l.asset.id, name: l.asset.name, kind: l.asset.kind, size: l.asset.size } : null,
        attachmentLabel: l.attachmentLabel,
        prerequisiteLessonId: l.prerequisiteLessonId,
        content:
          "body" in content
            ? { body: content.body }
            : "label" in content
              ? { url: content.url, label: content.label }
              : { url: content.url },
      };
    }),
  }));

  return <CurriculumEditor courseId={course.id} modules={moduleRows} />;
}
