"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { LessonType } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { getCurrentWorkspace } from "@/lib/workspace";
import { lessonSchema } from "@/lib/zod";
import type { LessonContent } from "@/lib/lms";

type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function loadCallerCourseId() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) return null;
  return current.workspace.id;
}

function paths(courseId: string) {
  return [
    `/dashboard/courses/${courseId}/modules`,
    `/dashboard/courses/${courseId}/lessons`,
  ];
}

function parseForm(formData: FormData) {
  return lessonSchema.safeParse({
    title: formData.get("title"),
    type: formData.get("type"),
    body: (formData.get("body") as string | null) ?? undefined,
    url: (formData.get("url") as string | null) ?? undefined,
    label: (formData.get("label") as string | null) ?? undefined,
    assetId: (formData.get("assetId") as string | null) ?? undefined,
    attachmentLabel: (formData.get("attachmentLabel") as string | null) ?? undefined,
    transcript: (formData.get("transcript") as string | null) ?? undefined,
    durationMinutes: formData.get("durationMinutes") || "0",
    prerequisiteLessonId: (formData.get("prerequisiteLessonId") as string | null) ?? undefined,
    isPreview: formData.get("isPreview") === "true",
    dripEnabled: formData.get("dripEnabled") === "true",
    dripDays: formData.get("dripDays") || "",
  });
}

function contentFor(type: LessonType, input: {
  body?: string;
  url?: string;
  label?: string;
}): LessonContent {
  switch (type) {
    case "TEXT":
      return { body: (input.body ?? "").trim() };
    case "VIDEO_EMBED":
    case "PDF":
      return { url: (input.url ?? "").trim() };
    case "LINK":
      return {
        url: (input.url ?? "").trim(),
        label: (input.label ?? "Open link").trim() || "Open link",
      };
  }
}

export async function createLessonAction(
  moduleId: string,
  formData: FormData
): Promise<ActionResult> {
  const workspaceId = await loadCallerCourseId();
  if (!workspaceId) return { ok: false, error: "Not allowed." };

  const mod = await prisma.courseModule.findUnique({
    where: { id: moduleId },
    include: { course: { select: { workspaceId: true, id: true } } },
  });
  if (!mod || mod.course.workspaceId !== workspaceId)
    return { ok: false, error: "Module not found." };

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the form for errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const last = await prisma.courseLesson.findFirst({
    where: { moduleId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const relationError = await validateLessonRelations(
    mod.course.id,
    parsed.data.assetId,
    parsed.data.prerequisiteLessonId
  );
  if (relationError) return { ok: false, error: relationError };

  await prisma.courseLesson.create({
    data: {
      moduleId,
      title: parsed.data.title.trim(),
      type: parsed.data.type,
      order: (last?.order ?? -1) + 1,
      content: contentFor(parsed.data.type, parsed.data),
      isPreview: parsed.data.isPreview,
      dripDays: parsed.data.dripEnabled ? parsed.data.dripDays ?? 0 : null,
      durationMinutes: parsed.data.durationMinutes,
      transcript: parsed.data.transcript?.trim() || null,
      assetId: parsed.data.assetId || null,
      attachmentLabel: parsed.data.attachmentLabel?.trim() || null,
      prerequisiteLessonId: parsed.data.prerequisiteLessonId || null,
    },
  });

  for (const p of paths(mod.course.id)) revalidatePath(p);
  return { ok: true };
}

export async function updateLessonAction(
  lessonId: string,
  formData: FormData
): Promise<ActionResult> {
  const workspaceId = await loadCallerCourseId();
  if (!workspaceId) return { ok: false, error: "Not allowed." };

  const lesson = await prisma.courseLesson.findUnique({
    where: { id: lessonId },
    include: {
      module: {
        include: { course: { select: { workspaceId: true, id: true } } },
      },
    },
  });
  if (!lesson || lesson.module.course.workspaceId !== workspaceId)
    return { ok: false, error: "Lesson not found." };

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the form for errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const relationError = await validateLessonRelations(
    lesson.module.course.id,
    parsed.data.assetId,
    parsed.data.prerequisiteLessonId,
    lessonId
  );
  if (relationError) return { ok: false, error: relationError };

  await prisma.courseLesson.update({
    where: { id: lessonId },
    data: {
      title: parsed.data.title.trim(),
      type: parsed.data.type,
      content: contentFor(parsed.data.type, parsed.data),
      isPreview: parsed.data.isPreview,
      dripDays: parsed.data.dripEnabled ? parsed.data.dripDays ?? 0 : null,
      durationMinutes: parsed.data.durationMinutes,
      transcript: parsed.data.transcript?.trim() || null,
      assetId: parsed.data.assetId || null,
      attachmentLabel: parsed.data.attachmentLabel?.trim() || null,
      prerequisiteLessonId: parsed.data.prerequisiteLessonId || null,
    },
  });

  for (const p of paths(lesson.module.course.id)) revalidatePath(p);
  return { ok: true };
}

async function validateLessonRelations(
  courseId: string,
  assetId?: string,
  prerequisiteLessonId?: string,
  lessonId?: string
) {
  if (assetId) {
    const asset = await prisma.courseAsset.findFirst({ where: { id: assetId, courseId }, select: { id: true } });
    if (!asset) return "Uploaded asset does not belong to this course.";
  }
  if (prerequisiteLessonId) {
    if (prerequisiteLessonId === lessonId) return "A lesson cannot require itself.";
    const prerequisite = await prisma.courseLesson.findFirst({
      where: { id: prerequisiteLessonId, module: { courseId } },
      select: { id: true },
    });
    if (!prerequisite) return "Prerequisite lesson does not belong to this course.";
  }
  return null;
}

export async function moveLessonAction(
  lessonId: string,
  direction: "up" | "down"
): Promise<ActionResult> {
  const workspaceId = await loadCallerCourseId();
  if (!workspaceId) return { ok: false, error: "Not allowed." };

  const lesson = await prisma.courseLesson.findUnique({
    where: { id: lessonId },
    include: {
      module: {
        include: { course: { select: { workspaceId: true, id: true } } },
      },
    },
  });
  if (!lesson || lesson.module.course.workspaceId !== workspaceId)
    return { ok: false, error: "Lesson not found." };

  const neighbour = await prisma.courseLesson.findFirst({
    where: {
      moduleId: lesson.moduleId,
      order: direction === "up" ? { lt: lesson.order } : { gt: lesson.order },
    },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbour) return { ok: true };

  await prisma.$transaction([
    prisma.courseLesson.update({
      where: { id: lesson.id },
      data: { order: neighbour.order },
    }),
    prisma.courseLesson.update({
      where: { id: neighbour.id },
      data: { order: lesson.order },
    }),
  ]);

  for (const p of paths(lesson.module.course.id)) revalidatePath(p);
  return { ok: true };
}

export async function deleteLessonAction(
  lessonId: string
): Promise<ActionResult> {
  const workspaceId = await loadCallerCourseId();
  if (!workspaceId) return { ok: false, error: "Not allowed." };

  const lesson = await prisma.courseLesson.findUnique({
    where: { id: lessonId },
    include: {
      module: {
        include: { course: { select: { workspaceId: true, id: true } } },
      },
    },
  });
  if (!lesson || lesson.module.course.workspaceId !== workspaceId)
    return { ok: false, error: "Lesson not found." };

  await prisma.courseLesson.delete({ where: { id: lessonId } });

  for (const p of paths(lesson.module.course.id)) revalidatePath(p);
  return { ok: true };
}
