"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { getCurrentWorkspace } from "@/lib/workspace";
import { moduleSchema } from "@/lib/zod";

type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function loadCourseForEdit(courseId: string) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) return null;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, workspaceId: true },
  });
  if (!course || course.workspaceId !== current.workspace.id) return null;
  return course;
}

function paths(courseId: string) {
  return [
    `/dashboard/courses/${courseId}/modules`,
    `/dashboard/courses/${courseId}/lessons`,
  ];
}

export async function createModuleAction(
  courseId: string,
  formData: FormData
): Promise<ActionResult> {
  const course = await loadCourseForEdit(courseId);
  if (!course) return { ok: false, error: "Not allowed." };

  const parsed = moduleSchema.safeParse({ title: formData.get("title") });
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

  const last = await prisma.courseModule.findFirst({
    where: { courseId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  await prisma.courseModule.create({
    data: {
      courseId,
      title: parsed.data.title.trim(),
      order: (last?.order ?? -1) + 1,
    },
  });

  for (const p of paths(courseId)) revalidatePath(p);
  return { ok: true };
}

export async function updateModuleAction(
  moduleId: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit"))
    return { ok: false, error: "Not allowed." };

  const mod = await prisma.courseModule.findUnique({
    where: { id: moduleId },
    include: { course: { select: { workspaceId: true, id: true } } },
  });
  if (!mod || mod.course.workspaceId !== current.workspace.id)
    return { ok: false, error: "Module not found." };

  const parsed = moduleSchema.safeParse({ title: formData.get("title") });
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

  await prisma.courseModule.update({
    where: { id: moduleId },
    data: { title: parsed.data.title.trim() },
  });

  for (const p of paths(mod.course.id)) revalidatePath(p);
  return { ok: true };
}

/** Swaps `order` with the neighbour in the requested direction. */
export async function moveModuleAction(
  moduleId: string,
  direction: "up" | "down"
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit"))
    return { ok: false, error: "Not allowed." };

  const mod = await prisma.courseModule.findUnique({
    where: { id: moduleId },
    include: { course: { select: { id: true, workspaceId: true } } },
  });
  if (!mod || mod.course.workspaceId !== current.workspace.id)
    return { ok: false, error: "Module not found." };

  const neighbour = await prisma.courseModule.findFirst({
    where: {
      courseId: mod.courseId,
      order: direction === "up" ? { lt: mod.order } : { gt: mod.order },
    },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbour) return { ok: true }; // already at the edge

  await prisma.$transaction([
    prisma.courseModule.update({
      where: { id: mod.id },
      data: { order: neighbour.order },
    }),
    prisma.courseModule.update({
      where: { id: neighbour.id },
      data: { order: mod.order },
    }),
  ]);

  for (const p of paths(mod.course.id)) revalidatePath(p);
  return { ok: true };
}

export async function deleteModuleAction(
  moduleId: string
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit"))
    return { ok: false, error: "Not allowed." };

  const mod = await prisma.courseModule.findUnique({
    where: { id: moduleId },
    include: { course: { select: { id: true, workspaceId: true } } },
  });
  if (!mod || mod.course.workspaceId !== current.workspace.id)
    return { ok: false, error: "Module not found." };

  await prisma.courseModule.delete({ where: { id: moduleId } });

  for (const p of paths(mod.course.id)) revalidatePath(p);
  return { ok: true };
}
