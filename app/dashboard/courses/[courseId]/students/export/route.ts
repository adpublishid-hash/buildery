import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace";

export async function GET(_: Request, { params }: { params: { courseId: string } }) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) return new NextResponse("Forbidden", { status: 403 });
  const course = await prisma.course.findFirst({ where: { id: params.courseId, workspaceId: current.workspace.id }, select: { title: true } });
  if (!course) return new NextResponse("Not found", { status: 404 });
  const rows = await prisma.enrollment.findMany({ where: { courseId: params.courseId }, include: { customer: true, cohort: true }, orderBy: { createdAt: "desc" } });
  const csv = [
    ["Name", "Email", "Status", "Progress", "Time seconds", "Cohort", "Enrolled", "Completed", "Access expires"],
    ...rows.map((row) => [row.customer.name, row.customer.email, row.status, row.progressPercent, row.totalTimeSeconds, row.cohort?.name ?? "", row.enrolledAt.toISOString(), row.completedAt?.toISOString() ?? "", row.accessExpiresAt?.toISOString() ?? ""]),
  ].map((row) => row.map(csvCell).join(",")).join("\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${course.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-students.csv"` } });
}

function csvCell(value: unknown) { const text = String(value ?? ""); return `"${text.replace(/"/g, '""')}"`; }
