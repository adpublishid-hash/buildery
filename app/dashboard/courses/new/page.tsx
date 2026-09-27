import { redirect } from "next/navigation";

import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { CourseForm } from "@/components/courses/course-form";

export const metadata = { title: "New course · My Landing" };

export default async function NewCoursePage() {
  const { workspace, role } = await requireCurrentWorkspace();
  if (!canInWorkspace(role, "content.edit")) {
    redirect("/dashboard/courses");
  }

  const membershipPlans = await prisma.membershipPlan.findMany({
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
  });

  return (
    <div className="w-full min-w-0">
      <CourseForm
        mode="create"
        workspaceSlug={workspace.slug}
        defaultImageUrl={null}
        membershipPlans={membershipPlans.map((plan) => ({
          id: plan.id,
          name: plan.name,
          level: plan.level,
          price: plan.price,
          isActive: plan.isActive,
          memberCount: plan._count.memberships,
        }))}
        defaultValues={{
          title: "",
          slug: "",
          summary: "",
          description: "",
          status: "DRAFT",
          pricing: "FREE",
          price: "",
          requiredLevel: "FREE",
          imageId: "",
        }}
      />
    </div>
  );
}
