import Link from "next/link";
import type { ComponentType } from "react";
import {
  BookOpen,
  Eye,
  FileText,
  GraduationCap,
  Plus,
  Settings2,
  Users,
} from "lucide-react";
import type { CourseStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { formatPrice } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { CourseRowActions } from "@/components/courses/course-row-actions";
import { CourseListControls } from "@/components/courses/course-list-controls";
import { formatDate } from "@/lib/utils";
import { Pagination, parsePage } from "@/components/ui/pagination";

export const metadata = { title: "Courses · My Landing" };

const STATUS_VARIANT: Record<
  CourseStatus,
  "default" | "secondary" | "success" | "outline"
> = {
  DRAFT: "secondary",
  PUBLISHED: "success",
  ARCHIVED: "outline",
} as const;

const STATUS_OPTIONS = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

type SearchParams = {
  q?: string;
  status?: string;
  page?: string;
};

const PAGE_SIZE = 50;

export default async function CoursesPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const { workspace, role } = await requireCurrentWorkspace();
  const canEdit = canInWorkspace(role, "content.edit");
  const query = (searchParams?.q ?? "").trim();
  const status = STATUS_OPTIONS.includes(searchParams?.status as CourseStatus)
    ? (searchParams?.status as CourseStatus)
    : "ALL";

  const where = {
    workspaceId: workspace.id,
    ...(status !== "ALL" ? { status } : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" as const } },
            { slug: { contains: query, mode: "insensitive" as const } },
            { summary: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const page = parsePage(searchParams?.page);
  const matchingCourses = await prisma.course.count({ where });
  const courses = await prisma.course.findMany({
    where,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      _count: { select: { modules: true, enrollments: true } },
      modules: {
        select: { _count: { select: { lessons: true } } },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const stats = await prisma.course.aggregate({
    where: { workspaceId: workspace.id },
    _count: { _all: true },
  });
  const statusCounts = await prisma.course.groupBy({
    by: ["status"],
    where: { workspaceId: workspace.id },
    _count: { _all: true },
  });
  const enrollmentCount = await prisma.enrollment.count({
    where: { course: { workspaceId: workspace.id } },
  });
  const lessonCount = await prisma.courseLesson.count({
    where: { module: { course: { workspaceId: workspace.id } } },
  });
  const statusMap = new Map(
    statusCounts.map((item) => [item.status, item._count._all])
  );
  const hasFilters = Boolean(query) || status !== "ALL";

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Courses"
        description="Sell or share knowledge as structured modules and lessons."
        action={
          canEdit ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" asChild>
                <Link href="/dashboard/courses/settings">
                  <Settings2 /> Halaman katalog
                </Link>
              </Button>
              <Button asChild>
                <Link href="/dashboard/courses/new">
                  <Plus /> New course
                </Link>
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <CourseMetric
          icon={GraduationCap}
          label="Total courses"
          value={stats._count._all}
          detail={`${statusMap.get("PUBLISHED") ?? 0} published`}
        />
        <CourseMetric
          icon={BookOpen}
          label="Lessons"
          value={lessonCount}
          detail={`${statusMap.get("DRAFT") ?? 0} drafts`}
        />
        <CourseMetric
          icon={Users}
          label="Enrollments"
          value={enrollmentCount}
          detail="Across all courses"
        />
        <CourseMetric
          icon={Eye}
          label="Archived"
          value={statusMap.get("ARCHIVED") ?? 0}
          detail="Hidden from catalog"
        />
      </div>

      <div className="mb-4">
        <CourseListControls query={query} status={status} />
      </div>

      {courses.length === 0 ? (
        <EmptyState
          icon={hasFilters ? FileText : GraduationCap}
          title={hasFilters ? "No matching courses" : "No courses yet"}
          description={
            hasFilters
              ? "Try another keyword or clear the current filters."
              : "Create your first course to start teaching."
          }
          action={
            canEdit ? (
              <Button asChild>
                <Link href="/dashboard/courses/new">
                  <Plus /> Create course
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Course</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pricing</TableHead>
                  <TableHead>Modules</TableHead>
                  <TableHead>Lessons</TableHead>
                  <TableHead>Enrolled</TableHead>
                  <TableHead>Updated</TableHead>
                  {canEdit && (
                    <TableHead className="w-12 pr-4 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.map((course) => {
                  const lessons = course.modules.reduce(
                    (total, mod) => total + mod._count.lessons,
                    0
                  );
                  return (
                    <TableRow key={course.id}>
                      <TableCell className="pl-4">
                        <Link
                          href={`/dashboard/courses/${course.id}/modules`}
                          className="text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                        >
                          {course.title}
                        </Link>
                        {course.summary ? (
                          <p className="truncate text-xs text-zinc-500">
                            {course.summary}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[course.status]}>
                          {course.status.charAt(0) +
                            course.status.slice(1).toLowerCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-zinc-500">
                        {course.isFree ? "Free" : formatPrice(course.price)}
                      </TableCell>
                      <TableCell className="text-sm text-zinc-500">
                        {course._count.modules}
                      </TableCell>
                      <TableCell className="text-sm text-zinc-500">
                        {lessons}
                      </TableCell>
                      <TableCell className="text-sm text-zinc-500">
                        {course._count.enrollments}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500">
                        {formatDate(course.updatedAt)}
                      </TableCell>
                      {canEdit && (
                        <TableCell className="pr-4 text-right">
                          <CourseRowActions
                            courseId={course.id}
                            courseTitle={course.title}
                            courseSlug={course.slug}
                            workspaceSlug={workspace.slug}
                            status={course.status}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pagination
              page={page}
              total={matchingCourses}
              pageSize={PAGE_SIZE}
              basePath="/dashboard/courses"
              params={{ q: query || undefined, status: status || undefined }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CourseMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          {label}
        </p>
        <Icon className="h-4 w-4 text-zinc-400" />
      </div>
      <p className="mt-3 text-2xl font-semibold text-zinc-950">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
    </div>
  );
}
