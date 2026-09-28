import { redirect } from "next/navigation";
import { Award, GraduationCap, TrendingUp, Users } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { countSubmissionsToGrade } from "@/lib/lms-overview";
import { parseStudentFilters, studentWhere } from "@/lib/lms-students";
import { SEAT_STATUSES } from "@/lib/lms-enrollment-rules";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel } from "@/components/dashboard/panel";
import { StatCard } from "@/components/dashboard/stat-card";
import { LmsNav } from "@/components/courses/lms-nav";
import { AddStudentsButton, StudentsTable, type StudentRow } from "@/components/courses/students-table";
import { Pagination, parsePage } from "@/components/ui/pagination";

export const metadata = { title: "Students · My Landing" };

const PAGE_SIZE = 50;

export default async function StudentsPage({
  searchParams,
}: {
  searchParams?: { course?: string; status?: string; q?: string; page?: string };
}) {
  const { workspace, role } = await requireCurrentWorkspace();
  if (!canInWorkspace(role, "content.edit")) redirect("/dashboard/courses");
  const page = parsePage(searchParams?.page);
  const filters = parseStudentFilters(searchParams ?? {});
  const where = studentWhere(workspace.id, filters);
  const now = Date.now();

  const [courses, enrollments, matchingCount, statusRows, uniqueStudents, avgProgress, toGrade] = await Promise.all([
    prisma.course.findMany({
      where: { workspaceId: workspace.id },
      select: {
        id: true,
        title: true,
        status: true,
        accessDays: true,
        enrollmentLimit: true,
        _count: { select: { enrollments: { where: { status: { in: SEAT_STATUSES } } } } },
        modules: { select: { _count: { select: { lessons: true } } } },
      },
      orderBy: [{ status: "asc" }, { title: "asc" }],
    }),
    prisma.enrollment.findMany({
      where,
      include: {
        customer: { select: { name: true, email: true } },
        course: { select: { id: true, title: true } },
        cohort: { select: { name: true } },
        certificate: { select: { revokedAt: true } },
        _count: { select: { progress: { where: { completedAt: { not: null } } } } },
      },
      orderBy: [{ lastAccessedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.enrollment.count({ where }),
    prisma.enrollment.groupBy({
      by: ["status"],
      where: studentWhere(workspace.id, { ...filters, status: "ALL" }),
      _count: { _all: true },
    }),
    prisma.enrollment.findMany({
      where: { workspaceId: workspace.id, ...(filters.courseId ? { courseId: filters.courseId } : {}) },
      distinct: ["customerId"],
      select: { customerId: true },
    }),
    prisma.enrollment.aggregate({
      where: {
        workspaceId: workspace.id,
        status: { in: ["ACTIVE", "COMPLETED"] },
        ...(filters.courseId ? { courseId: filters.courseId } : {}),
      },
      _avg: { progressPercent: true },
    }),
    countSubmissionsToGrade(workspace.id),
  ]);

  const lessonsByCourse = new Map(
    courses.map((course) => [course.id, course.modules.reduce((sum, module) => sum + module._count.lessons, 0)])
  );
  const counts: Partial<Record<(typeof statusRows)[number]["status"], number>> = {};
  let total = 0;
  for (const row of statusRows) {
    counts[row.status] = row._count._all;
    total += row._count._all;
  }
  const completed = counts.COMPLETED ?? 0;
  const active = counts.ACTIVE ?? 0;
  const completionRate = active + completed > 0 ? Math.round((completed / (active + completed)) * 100) : 0;
  const courseFilter = courses.find((course) => course.id === filters.courseId);

  const rows: StudentRow[] = enrollments.map((item) => ({
    id: item.id,
    courseId: item.course.id,
    courseTitle: item.course.title,
    status: item.status,
    name: item.customer.name,
    email: item.customer.email,
    cohort: item.cohort?.name ?? null,
    progressPercent: item.progressPercent,
    completedLessons: item._count.progress,
    totalLessons: lessonsByCourse.get(item.course.id) ?? 0,
    lastAccessedAt: item.lastAccessedAt,
    enrolledAt: item.enrolledAt,
    accessExpiresAt: item.accessExpiresAt,
    certificate: Boolean(item.certificate && !item.certificate.revokedAt),
  }));

  // Archived courses still count lessons for old enrollments, but aren't offered.
  const courseOptions = courses.filter((course) => course.status !== "ARCHIVED" || course.id === filters.courseId).map((course) => ({
    id: course.id,
    title: course.title,
    accessDays: course.accessDays,
    seatsLeft: course.enrollmentLimit ? Math.max(0, course.enrollmentLimit - course._count.enrollments) : null,
  }));

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Students"
        description={courseFilter ? `Learners enrolled in ${courseFilter.title}.` : "Everyone enrolled in your courses, in one place."}
        action={<AddStudentsButton courses={courseOptions} defaultCourseId={filters.courseId} />}
      />
      <LmsNav toGrade={toGrade} />

      <div className="mb-[16px] grid grid-cols-1 gap-[12px] sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label="Students" value={uniqueStudents.length.toLocaleString()} delta={`${total.toLocaleString()} ${total === 1 ? "enrollment" : "enrollments"}`} icon={Users} />
        <StatCard index={1} label="Learning now" value={active.toLocaleString()} delta={counts.PENDING ? `${counts.PENDING} awaiting payment` : "Active enrollments"} icon={GraduationCap} />
        <StatCard index={2} label="Completed" value={completed.toLocaleString()} delta={`${completionRate}% completion rate`} icon={Award} />
        <StatCard index={3} label="Average progress" value={`${Math.round(avgProgress._avg.progressPercent ?? 0)}%`} delta="Active and completed" icon={TrendingUp} />
      </div>

      {total === 0 && !filters.q && filters.status === "ALL" ? (
        <EmptyState
          icon={Users}
          title={courseFilter ? "No students in this course yet" : "No students yet"}
          description={
            courseOptions.length
              ? "Students appear here when they enroll from your course pages, buy a course, or when you add them."
              : "Create a course first, then share it or add students here."
          }
          action={courseOptions.length ? <AddStudentsButton courses={courseOptions} defaultCourseId={filters.courseId} /> : undefined}
        />
      ) : (
        <Panel title="Enrollments" icon={Users}>
          <StudentsTable
            rows={rows}
            courses={courseOptions}
            filters={filters}
            counts={counts}
            matchingCount={matchingCount}
            now={now}
          />
          <Pagination
            page={page}
            total={matchingCount}
            pageSize={PAGE_SIZE}
            basePath="/dashboard/courses/students"
            params={{
              course: filters.courseId || undefined,
              status: filters.status !== "ALL" ? filters.status : undefined,
              q: filters.q || undefined,
            }}
          />
        </Panel>
      )}
    </div>
  );
}
