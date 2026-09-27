import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { CourseForm } from "@/components/courses/course-form";

export const metadata = { title: "Course details · My Landing" };

export default async function CourseEditDetailsPage({
  params,
}: {
  params: { courseId: string };
}) {
  const { workspace, role } = await requireCurrentWorkspace();
  if (!canInWorkspace(role, "content.edit")) {
    redirect("/dashboard/courses");
  }

  const [course, membershipPlans] = await Promise.all([
    prisma.course.findUnique({
      where: { id: params.courseId },
      include: { image: true },
    }),
    prisma.membershipPlan.findMany({
      where: { workspaceId: workspace.id },
      select: {
        id: true,
        name: true,
        level: true,
        price: true,
        isActive: true,
        _count: { select: { memberships: true } },
      },
      orderBy: [{ level: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  if (!course || course.workspaceId !== workspace.id) notFound();

  return (
    <CourseForm
      mode="edit"
      courseId={course.id}
      workspaceSlug={workspace.slug}
      defaultImageUrl={course.image?.url ?? null}
      membershipPlans={membershipPlans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        level: plan.level,
        price: plan.price,
        isActive: plan.isActive,
        memberCount: plan._count.memberships,
      }))}
      defaultValues={{
        title: course.title,
        slug: course.slug,
        summary: course.summary ?? "",
        description: course.description ?? "",
        status: course.status,
        pricing: course.isFree ? "FREE" : "PAID",
        price: course.price ? String(course.price) : "",
        requiredLevel: course.requiredLevel,
        imageId: course.imageId ?? "",
      }}
    />
  );
}
