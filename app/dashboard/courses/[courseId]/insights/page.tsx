import { notFound, redirect } from "next/navigation";
import { BarChart3, CheckCircle2, Clock3, DollarSign, Star, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";
import { moderateCourseReviewAction } from "@/lib/actions/lms-admin";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";
import { requireCurrentWorkspace } from "@/lib/workspace";

export const metadata = { title: "Course insights · My Landing" };

export default async function CourseInsightsPage({ params }: { params: { courseId: string } }) {
  const { workspace, role } = await requireCurrentWorkspace();
  if (!canInWorkspace(role, "content.edit")) redirect("/dashboard/courses");
  const course = await prisma.course.findFirst({
    where: { id: params.courseId, workspaceId: workspace.id },
    include: { modules: { orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" } } } } },
  });
  if (!course) notFound();
  const lessons = course.modules.flatMap((module) => module.lessons);
  const [enrollmentStats, completed, started, revenue, progressRows, quizStats, reviews] = await Promise.all([
    prisma.enrollment.aggregate({ where: { courseId: course.id }, _count: { _all: true }, _avg: { progressPercent: true, totalTimeSeconds: true } }),
    prisma.enrollment.count({ where: { courseId: course.id, status: "COMPLETED" } }),
    prisma.enrollment.count({ where: { courseId: course.id, startedAt: { not: null } } }),
    prisma.payment.aggregate({ where: { status: "PAID", enrollment: { courseId: course.id } }, _sum: { amount: true } }),
    prisma.lessonProgress.groupBy({ by: ["lessonId"], where: { lessonId: { in: lessons.map((item) => item.id) } }, _count: { _all: true }, _avg: { timeSpentSeconds: true, progressPercent: true } }),
    prisma.quizAttempt.aggregate({ where: { quiz: { lesson: { module: { courseId: course.id } } } }, _avg: { score: true }, _count: { _all: true } }),
    prisma.courseReview.findMany({ where: { courseId: course.id }, include: { customer: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const total = enrollmentStats._count._all;
  const avgProgress = total ? Math.round(enrollmentStats._avg.progressPercent ?? 0) : 0;
  const avgMinutes = total ? Math.round((enrollmentStats._avg.totalTimeSeconds ?? 0) / 60) : 0;
  const progressByLesson = new Map(progressRows.map((row) => [row.lessonId, row]));

  return <div className="space-y-6">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <StatCard icon={Users} label="Enrollments" value={total} />
      <StatCard icon={CheckCircle2} label="Completion" value={total ? `${Math.round((completed / total) * 100)}%` : "0%"} />
      <StatCard icon={BarChart3} label="Avg. progress" value={`${avgProgress}%`} />
      <StatCard icon={Clock3} label="Avg. study time" value={`${avgMinutes} min`} />
      <StatCard icon={DollarSign} label="Course revenue" value={formatPrice(revenue._sum.amount ?? 0)} />
    </div>

    <Card><CardHeader><CardTitle>Lesson engagement and drop-off</CardTitle><CardDescription>{started} learners started. Quiz average: {Math.round(quizStats._avg.score ?? 0)}% across {quizStats._count._all} attempts.</CardDescription></CardHeader><CardContent className="space-y-3">{lessons.map((lesson, index) => {
      const row = progressByLesson.get(lesson.id);
      const viewers = row?._count._all ?? 0;
      const reach = started ? Math.round((viewers / started) * 100) : 0;
      return <div key={lesson.id} className="grid gap-2 sm:grid-cols-[minmax(0,260px)_1fr_110px] sm:items-center"><p className="truncate text-sm"><span className="mr-2 text-zinc-400">{index + 1}.</span>{lesson.title}</p><div className="h-2 overflow-hidden rounded-full bg-zinc-100"><div className="h-full bg-zinc-900" style={{ width: `${Math.min(100, reach)}%` }} /></div><p className="text-right text-xs text-zinc-500">{reach}% reached</p></div>;
    })}</CardContent></Card>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Star className="h-4 w-4" />Course reviews</CardTitle><CardDescription>Moderate learner feedback before it appears publicly.</CardDescription></CardHeader><CardContent className="space-y-3">{reviews.length === 0 ? <p className="text-sm text-zinc-500">No reviews yet.</p> : reviews.map((review) => <div key={review.id} className="flex flex-col gap-3 border-t border-zinc-100 pt-3 first:border-0 first:pt-0 sm:flex-row sm:items-start"><div className="flex-1"><div className="flex items-center gap-2"><p className="text-sm font-medium">{review.customer.name}</p><Badge variant="outline">{review.rating}/5</Badge><Badge variant={review.status === "APPROVED" ? "success" : "secondary"}>{review.status}</Badge></div><p className="mt-1 text-sm text-zinc-600">{review.title}</p><p className="text-xs text-zinc-500">{review.body}</p></div><div className="flex gap-2"><ReviewAction reviewId={review.id} approved /><ReviewAction reviewId={review.id} approved={false} /></div></div>)}</CardContent></Card>
  </div>;
}

function ReviewAction({ reviewId, approved }: { reviewId: string; approved: boolean }) { return <form action={async () => { "use server"; await moderateCourseReviewAction(reviewId, approved); }}><Button size="sm" variant={approved ? "default" : "outline"} type="submit">{approved ? "Approve" : "Reject"}</Button></form>; }
