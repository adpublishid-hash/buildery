"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CourseStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteOrphanUpload } from "@/lib/upload-cleanup";
import { canInWorkspace } from "@/lib/permissions";
import { getCurrentWorkspace } from "@/lib/workspace";
import { assertCanCreate } from "@/lib/saas-limits";
import { slugify } from "@/lib/slug";
import { courseSchema } from "@/lib/zod";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function requireEditableWorkspace() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) return null;
  return current.workspace;
}

function parseForm(formData: FormData) {
  return courseSchema.safeParse({
    title: formData.get("title"),
    slug: formData.get("slug"),
    summary: formData.get("summary") || undefined,
    description: formData.get("description") || undefined,
    status: formData.get("status"),
    isFree: formData.get("isFree") === "true",
    price: formData.get("price") || 0,
    requiredLevel: formData.get("requiredLevel") || "FREE",
    imageId: formData.get("imageId") || "",
  });
}

export async function createCourseAction(
  formData: FormData
): Promise<ActionResult<{ courseId: string }>> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

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
  if (parsed.data.status === "PUBLISHED") {
    return { ok: false, error: "Create the course first, add at least one complete lesson, then publish it." };
  }

  const overLimit = await assertCanCreate(workspace.createdById, "course");
  if (overLimit) return { ok: false, error: overLimit };

  const slug = slugify(parsed.data.slug);
  const conflict = await prisma.course.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true },
  });
  if (conflict) {
    return {
      ok: false,
      error: "That slug is already taken.",
      fieldErrors: { slug: ["That slug is already taken."] },
    };
  }

  const course = await prisma.course.create({
    data: {
      workspaceId: workspace.id,
      title: parsed.data.title.trim(),
      slug,
      summary: parsed.data.summary?.trim() || null,
      description: parsed.data.description?.trim() || null,
      status: parsed.data.status,
      isFree: parsed.data.isFree,
      price: parsed.data.isFree ? 0 : parsed.data.price,
      requiredLevel: parsed.data.requiredLevel,
      publishedAt: null,
      imageId: parsed.data.imageId || null,
    },
  });

  revalidatePath("/dashboard/courses");
  return { ok: true, data: { courseId: course.id } };
}

export async function updateCourseAction(
  courseId: string,
  formData: FormData
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { workspaceId: true, status: true },
  });
  if (!course || course.workspaceId !== workspace.id) {
    return { ok: false, error: "Course not found." };
  }

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

  const slug = slugify(parsed.data.slug);
  const slugConflict = await prisma.course.findFirst({
    where: { workspaceId: workspace.id, slug, NOT: { id: courseId } },
    select: { id: true },
  });
  if (slugConflict) {
    return {
      ok: false,
      error: "That slug is already taken.",
      fieldErrors: { slug: ["That slug is already taken."] },
    };
  }

  const nowPublished =
    parsed.data.status === "PUBLISHED" && course.status !== "PUBLISHED";
  if (parsed.data.status === "PUBLISHED") {
    const publishError = await coursePublishError(courseId, {
      title: parsed.data.title,
      summary: parsed.data.summary,
      description: parsed.data.description,
      imageId: parsed.data.imageId,
    });
    if (publishError) return { ok: false, error: publishError };
  }

  await prisma.course.update({
    where: { id: courseId },
    data: {
      title: parsed.data.title.trim(),
      slug,
      summary: parsed.data.summary?.trim() || null,
      description: parsed.data.description?.trim() || null,
      status: parsed.data.status,
      isFree: parsed.data.isFree,
      price: parsed.data.isFree ? 0 : parsed.data.price,
      requiredLevel: parsed.data.requiredLevel,
      publishedAt: nowPublished ? new Date() : undefined,
      imageId: parsed.data.imageId || null,
    },
  });
  if (nowPublished) await snapshotCourse(courseId);

  revalidatePath("/dashboard/courses");
  revalidatePath(`/dashboard/courses/${courseId}/edit`);
  return { ok: true };
}

export async function setCourseStatusAction(
  courseId: string,
  status: CourseStatus
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { workspaceId: true, status: true },
  });
  if (!course || course.workspaceId !== workspace.id) {
    return { ok: false, error: "Course not found." };
  }
  if (status === "PUBLISHED") {
    const publishError = await coursePublishError(courseId);
    if (publishError) return { ok: false, error: publishError };
  }

  await prisma.course.update({
    where: { id: courseId },
    data: {
      status,
      publishedAt:
        status === "PUBLISHED" && course.status !== "PUBLISHED"
          ? new Date()
          : undefined,
    },
  });
  if (status === "PUBLISHED" && course.status !== "PUBLISHED") await snapshotCourse(courseId);

  revalidatePath("/dashboard/courses");
  return { ok: true };
}

async function coursePublishError(courseId: string, pending?: { title?: string; summary?: string; description?: string; imageId?: string }) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { modules: { include: { lessons: true } } },
  });
  if (!course) return "Course not found.";
  if (!(pending?.title ?? course.title).trim() || !(pending?.summary ?? course.summary)?.trim() || !(pending?.description ?? course.description)?.trim()) {
    return "Add a title, summary, and description before publishing.";
  }
  if (!(pending?.imageId ?? course.imageId)) return "Add a course cover before publishing.";
  const lessons = course.modules.flatMap((module) => module.lessons);
  if (!course.modules.length || !lessons.length) return "Add at least one module and lesson before publishing.";
  const incomplete = lessons.find((lesson) => {
    const content = lesson.content as Record<string, unknown>;
    if (lesson.type === "TEXT") return !String(content.body ?? "").replace(/<[^>]+>/g, "").trim();
    return !lesson.assetId && !String(content.url ?? "").trim();
  });
  return incomplete ? `Complete the content for lesson "${incomplete.title}" before publishing.` : null;
}

async function snapshotCourse(courseId: string) {
  const [course, latest] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId }, include: { modules: { orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" } } } } } }),
    prisma.courseRevision.findFirst({ where: { courseId }, orderBy: { version: "desc" }, select: { version: true } }),
  ]);
  if (!course) return;
  const snapshot = JSON.parse(JSON.stringify(course));
  await prisma.courseRevision.create({ data: { courseId, version: (latest?.version ?? 0) + 1, snapshot } });
}

export async function deleteCourseAction(
  courseId: string
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { workspaceId: true, imageId: true },
  });
  if (!course || course.workspaceId !== workspace.id) {
    return { ok: false, error: "Course not found." };
  }

  await prisma.course.delete({ where: { id: courseId } });
  await deleteOrphanUpload(course.imageId).catch(() => false);

  revalidatePath("/dashboard/courses");
  return { ok: true };
}
