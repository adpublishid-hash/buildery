import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { csvCell } from "@/lib/csv";
import { parseStudentFilters, studentWhere } from "@/lib/lms-students";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace";

/** Every enrollment in the workspace (respecting the page's filters) as CSV. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) return new NextResponse("Forbidden", { status: 403 });
  const search = new URL(request.url).searchParams;
  const filters = parseStudentFilters({ course: search.get("course"), status: search.get("status"), q: search.get("q") });
  const rows = await prisma.enrollment.findMany({
    where: studentWhere(current.workspace.id, filters),
    include: { customer: true, cohort: true, course: { select: { title: true } } },
    orderBy: { createdAt: "desc" },
    take: 50_000,
  });
  const csv = [
    ["Name", "Email", "Course", "Status", "Progress", "Time seconds", "Cohort", "Enrolled", "Last activity", "Completed", "Access expires"],
    ...rows.map((row) => [
      row.customer.name,
      row.customer.email,
      row.course.title,
      row.status,
      row.progressPercent,
      row.totalTimeSeconds,
      row.cohort?.name ?? "",
      row.enrolledAt.toISOString(),
      row.lastAccessedAt?.toISOString() ?? "",
      row.completedAt?.toISOString() ?? "",
      row.accessExpiresAt?.toISOString() ?? "",
    ]),
  ].map((row) => row.map(csvCell).join(",")).join("\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="students-${stamp}.csv"`,
    },
  });
}
