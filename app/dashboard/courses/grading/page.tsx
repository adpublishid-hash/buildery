import { redirect } from "next/navigation";
import { ClipboardCheck, Clock3, Inbox } from "lucide-react";
import type { AssignmentSubmissionStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel } from "@/components/dashboard/panel";
import { StatCard } from "@/components/dashboard/stat-card";
import { TabBar } from "@/components/ui/tab-bar";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { LmsNav } from "@/components/courses/lms-nav";
import { CourseFilterSelect } from "@/components/courses/course-filter-select";
import { GradingCard, type GradingItem } from "@/components/courses/grading-card";

export const metadata = { title: "Grading · My Landing" };

const PAGE_SIZE = 20;
const TABS: { key: "SUBMITTED" | "RETURNED" | "GRADED"; label: string }[] = [
  { key: "SUBMITTED", label: "To grade" },
  { key: "RETURNED", label: "Returned" },
  { key: "GRADED", label: "Graded" },
];

export default async function GradingPage({
  searchParams,
}: {
  searchParams?: { tab?: string; course?: string; page?: string };
}) {
  const { workspace, role } = await requireCurrentWorkspace();
  if (!canInWorkspace(role, "content.edit")) redirect("/dashboard/courses");
  const tab = TABS.find((item) => item.key === searchParams?.tab)?.key ?? "SUBMITTED";
  const courseId = searchParams?.course?.slice(0, 40) || "";
  const page = parsePage(searchParams?.page);

  const scope: Prisma.AssignmentSubmissionWhereInput = {
    assignment: {
      lesson: { module: { course: { workspaceId: workspace.id, ...(courseId ? { id: courseId } : {}) } } },
    },
  };
  const where: Prisma.AssignmentSubmissionWhereInput = { ...scope, status: tab };

  const [submissions, matching, statusRows, oldest, courses, gradedThisWeek] = await Promise.all([
    prisma.assignmentSubmission.findMany({
      where,
      include: {
        customer: { select: { name: true, email: true } },
        assignment: {
          select: {
            title: true,
            instructions: true,
            maxScore: true,
            lesson: { select: { title: true, module: { select: { course: { select: { id: true, title: true } } } } } },
          },
        },
      },
      // Oldest first while grading, so nobody waits longest; newest first in history.
      orderBy: tab === "SUBMITTED" ? { submittedAt: "asc" } : { gradedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.assignmentSubmission.count({ where }),
    prisma.assignmentSubmission.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
    prisma.assignmentSubmission.findFirst({
      where: { ...scope, status: "SUBMITTED" },
      orderBy: { submittedAt: "asc" },
      select: { submittedAt: true },
    }),
    prisma.course.findMany({
      where: { workspaceId: workspace.id, modules: { some: { lessons: { some: { assignment: { isNot: null } } } } } },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
    prisma.assignmentSubmission.count({
      where: { ...scope, status: "GRADED", gradedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    }),
  ]);

  const counts = new Map<AssignmentSubmissionStatus, number>(statusRows.map((row) => [row.status, row._count._all]));
  const toGrade = counts.get("SUBMITTED") ?? 0;
  const waitingDays = oldest?.submittedAt ? Math.floor((Date.now() - oldest.submittedAt.getTime()) / 86_400_000) : 0;
  const items: GradingItem[] = submissions.map((submission) => ({
    id: submission.id,
    status: submission.status as GradingItem["status"],
    learnerName: submission.customer.name,
    learnerEmail: submission.customer.email,
    courseId: submission.assignment.lesson.module.course.id,
    courseTitle: submission.assignment.lesson.module.course.title,
    lessonTitle: submission.assignment.lesson.title,
    assignmentTitle: submission.assignment.title,
    instructions: submission.assignment.instructions,
    maxScore: submission.assignment.maxScore,
    submissionText: submission.submissionText,
    fileUrl: submission.fileUrl,
    submittedAt: submission.submittedAt,
    gradedAt: submission.gradedAt,
    score: submission.score,
    feedback: submission.feedback,
  }));
  const hrefFor = (next: { tab?: string; course?: string }) => {
    const params = new URLSearchParams();
    const t = next.tab ?? tab;
    const c = "course" in next ? next.course : courseId;
    if (t !== "SUBMITTED") params.set("tab", t);
    if (c) params.set("course", c);
    const qs = params.toString();
    return qs ? `/dashboard/courses/grading?${qs}` : "/dashboard/courses/grading";
  };

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Grading"
        description="Review assignment submissions from every course. Grading completes the lesson; returning asks for another attempt."
      />
      <LmsNav toGrade={toGrade} />

      <div className="mb-[16px] grid grid-cols-1 gap-[12px] sm:grid-cols-3">
        <StatCard index={0} label="To grade" value={toGrade} delta={toGrade ? "Oldest first in the queue" : "Queue is clear"} icon={Inbox} />
        <StatCard index={1} label="Longest wait" value={toGrade ? (waitingDays ? `${waitingDays} ${waitingDays === 1 ? "day" : "days"}` : "Today") : "—"} delta="Since the oldest submission" icon={Clock3} />
        <StatCard index={2} label="Graded this week" value={gradedThisWeek} delta={`${counts.get("RETURNED") ?? 0} waiting on learners`} icon={ClipboardCheck} />
      </div>

      {courses.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No assignments yet"
          description="Add an assignment to a lesson from a course's Tools tab. Learner submissions will queue up here for grading."
        />
      ) : (
        <Panel title="Submissions" icon={ClipboardCheck}>
          <div className="flex flex-col gap-[10px] border-b-[0.8px] border-kv-border p-[10px] sm:flex-row sm:items-center sm:justify-between">
            <TabBar
              ariaLabel="Submission status"
              active={tab}
              items={TABS.map((item) => ({
                key: item.key,
                label: item.label,
                href: hrefFor({ tab: item.key }),
                count: counts.get(item.key),
              }))}
            />
            <CourseFilterSelect courses={courses} value={courseId} hrefBase={hrefFor({ course: "" })} />
          </div>
          {items.length === 0 ? (
            <div className="px-[16px] py-[40px] text-center">
              <p className="text-[13px] font-medium text-kv-fg">
                {tab === "SUBMITTED" ? "All caught up" : tab === "RETURNED" ? "Nothing returned" : "Nothing graded yet"}
              </p>
              <p className="mt-[4px] text-[12px] text-kv-muted-fg">
                {tab === "SUBMITTED"
                  ? "New submissions will appear here as learners send them."
                  : tab === "RETURNED"
                    ? "Work you send back for revision waits here until the learner resubmits."
                    : "Graded submissions are kept here so you can adjust a score later."}
              </p>
            </div>
          ) : (
            <div>
              {items.map((item) => (
                <GradingCard key={`${item.id}-${item.status}`} item={item} />
              ))}
            </div>
          )}
          <Pagination
            page={page}
            total={matching}
            pageSize={PAGE_SIZE}
            basePath="/dashboard/courses/grading"
            params={{ tab: tab !== "SUBMITTED" ? tab : undefined, course: courseId || undefined }}
          />
        </Panel>
      )}
    </div>
  );
}
