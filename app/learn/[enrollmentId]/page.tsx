import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type React from "react";
import type { LessonType } from "@prisma/client";
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  FileText,
  Link2,
  LockKeyhole,
  PlayCircle,
  Trophy,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import { publicSiteHref } from "@/lib/public-url";
import { Button } from "@/components/ui/button";
import { LessonContent } from "@/components/learn/lesson-content";
import { LessonProgressToggle } from "@/components/learn/lesson-progress-toggle";
import { LessonActivityTracker } from "@/components/learn/lesson-activity-tracker";
import {
  AssignmentPanel,
  CourseReviewPanel,
  DiscussionPanel,
  LessonPersonalTools,
  QuizPlayer,
} from "@/components/learn/learning-tools";
import { cn } from "@/lib/utils";
import { getMemberSession } from "@/lib/member-auth";
import { hasRequiredMembership } from "@/lib/membership";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Learn" },
  robots: { index: false },
};

const LESSON_ICON: Record<LessonType, React.ComponentType<{ className?: string }>> = {
  TEXT: FileText,
  VIDEO_EMBED: PlayCircle,
  PDF: FileText,
  LINK: Link2,
};

const LESSON_LABEL: Record<LessonType, string> = {
  TEXT: "Text lesson",
  VIDEO_EMBED: "Video lesson",
  PDF: "PDF material",
  LINK: "External resource",
};

export default async function LearnPage({
  params,
  searchParams,
}: {
  params: { enrollmentId: string };
  searchParams: { lesson?: string };
}) {
  const member = await getMemberSession();
  if (!member) notFound();

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      id: params.enrollmentId,
      customerId: member.customerId,
      workspaceId: member.workspaceId,
      status: { in: ["ACTIVE", "COMPLETED"] },
    },
    include: {
      course: {
        include: {
          workspace: { select: { name: true, slug: true } },
          modules: {
            include: { lessons: { include: { asset: true }, orderBy: { order: "asc" } } },
            orderBy: { order: "asc" },
          },
          announcements: { where: { publishedAt: { not: null } }, orderBy: { publishedAt: "desc" }, take: 5 },
          liveSessions: { where: { startsAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, orderBy: { startsAt: "asc" }, take: 10 },
        },
      },
      customer: { select: { name: true, email: true } },
      progress: true,
      certificate: true,
    },
  });
  if (!enrollment) notFound();
  if (enrollment.accessExpiresAt && enrollment.accessExpiresAt <= new Date()) notFound();
  if (
    !(await hasRequiredMembership(
      enrollment.workspaceId,
      enrollment.customerId,
      enrollment.course.requiredLevel
    ))
  ) {
    notFound();
  }

  const courseHref = publicSiteHref(
    enrollment.course.workspace.slug,
    `courses/${enrollment.course.slug}`
  );

  // Flatten lessons for navigation + completion lookup.
  const flat = enrollment.course.modules.flatMap((m) =>
    m.lessons.map((l) => ({
      moduleId: m.id,
      moduleTitle: m.title,
      lessonId: l.id,
      title: l.title,
      type: l.type,
      content: l.content,
      dripDays: l.dripDays,
      durationMinutes: l.durationMinutes,
      transcript: l.transcript,
      attachmentLabel: l.attachmentLabel,
      prerequisiteLessonId: l.prerequisiteLessonId,
      asset: l.asset ? { id: l.asset.id, name: l.asset.name, kind: l.asset.kind } : null,
    }))
  );
  const completedSet = new Set(
    enrollment.progress.filter((p) => p.completedAt).map((p) => p.lessonId)
  );

  if (flat.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="text-center">
          <p className="text-sm font-medium text-zinc-900">
            This course doesn&apos;t have any lessons yet.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Check back once the instructor publishes content.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link href={courseHref}>
              Back to course page
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const requestedLesson = searchParams.lesson || enrollment.lastLessonId || undefined;
  const activeIndex = Math.max(
    0,
    flat.findIndex((l) => l.lessonId === requestedLesson)
  );
  const active = flat[activeIndex];
  const prev = activeIndex > 0 ? flat[activeIndex - 1] : null;
  const next = activeIndex < flat.length - 1 ? flat[activeIndex + 1] : null;

  const completedCount = flat.filter((lesson) => completedSet.has(lesson.lessonId)).length;
  const progressPct =
    flat.length === 0 ? 0 : Math.round((completedCount / flat.length) * 100);
  const allDone = completedCount === flat.length;
  const activeCompleted = completedSet.has(active.lessonId);
  const isSingleLesson = flat.length === 1;
  const activeUnlockAt = dripUnlockAt(enrollment.enrolledAt, active.dripDays);
  const activePrerequisiteLocked = Boolean(active.prerequisiteLessonId && !completedSet.has(active.prerequisiteLessonId));
  const activeSequenceLocked = Boolean(enrollment.course.sequentialProgress && activeIndex > 0 && !completedSet.has(flat[activeIndex - 1].lessonId));
  const activeLocked = Boolean((activeUnlockAt && activeUnlockAt > new Date()) || activePrerequisiteLocked || activeSequenceLocked);
  const [note, bookmark, discussions, quiz, assignment, review] = await Promise.all([
    prisma.courseNote.findUnique({ where: { lessonId_customerId: { lessonId: active.lessonId, customerId: member.customerId } } }),
    prisma.lessonBookmark.findUnique({ where: { lessonId_customerId: { lessonId: active.lessonId, customerId: member.customerId } } }),
    prisma.courseDiscussion.findMany({ where: { lessonId: active.lessonId, isHidden: false, parentId: null }, include: { customer: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 100 }),
    prisma.courseQuiz.findUnique({ where: { lessonId: active.lessonId }, include: { questions: { orderBy: { order: "asc" } }, attempts: { where: { enrollmentId: enrollment.id }, orderBy: { submittedAt: "desc" } } } }),
    prisma.courseAssignment.findUnique({ where: { lessonId: active.lessonId }, include: { submissions: { where: { enrollmentId: enrollment.id }, take: 1 } } }),
    prisma.courseReview.findUnique({ where: { courseId_customerId: { courseId: enrollment.courseId, customerId: member.customerId } } }),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white px-4 py-3 md:px-6">
        <div className="mx-auto flex max-w-7xl items-center gap-4">
          <Link
            href={courseHref}
            className="text-xs text-zinc-500 hover:text-zinc-900"
          >
            ← {enrollment.course.workspace.name}
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-zinc-900">
              {enrollment.course.title}
            </p>
            <p className="text-xs text-zinc-500">
              {completedCount} of {flat.length} lessons · {progressPct}%
              complete
            </p>
          </div>
          <div className="hidden text-right text-xs text-zinc-500 sm:block">
            {enrollment.customer.name || enrollment.customer.email}
          </div>
        </div>
        <div className="mx-auto mt-2 max-w-7xl">
          <div className="h-1 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </header>

      <div
        className={cn(
          "mx-auto flex w-full flex-1 flex-col gap-6 px-4 py-6 md:px-6",
          isSingleLesson ? "max-w-7xl lg:flex-row" : "max-w-6xl md:flex-row"
        )}
      >
        <aside
          className={cn(
            "w-full shrink-0",
            isSingleLesson ? "lg:w-72" : "md:w-80"
          )}
        >
          <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Progress
                </p>
                <p className="mt-1 text-2xl font-semibold text-zinc-950">
                  {progressPct}%
                </p>
              </div>
              {allDone ? (
                <Trophy className="h-6 w-6 text-amber-500" />
              ) : (
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              )}
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              {completedCount} completed · {flat.length - completedCount} left
            </p>
            {isSingleLesson ? (
              <div className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                {activeCompleted
                  ? "Lesson ini sudah selesai. Kamu bisa kembali ke halaman course kapan saja."
                  : "Selesaikan lesson ini untuk menuntaskan course."}
              </div>
            ) : null}
          </div>

          {isSingleLesson ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm md:sticky md:top-6">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Current lesson
              </p>
              <div className="mt-3 flex items-start gap-3 rounded-lg bg-zinc-950 px-3 py-3 text-white">
                {activeCompleted ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium">{active.title}</p>
                  <p className="mt-1 text-xs text-zinc-400">
                    {LESSON_LABEL[active.type]}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <ol className="space-y-3 text-sm md:sticky md:top-6">
              {enrollment.course.modules.map((mod, mIdx) => (
                <li
                  key={mod.id}
                  className="rounded-xl border border-zinc-200 bg-white p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      {mIdx + 1}. {mod.title}
                    </p>
                    <span className="shrink-0 text-[11px] text-zinc-400">
                      {
                        mod.lessons.filter((lesson) =>
                          completedSet.has(lesson.id)
                        ).length
                      }
                      /{mod.lessons.length}
                    </span>
                  </div>
                  <ol className="space-y-0.5">
                    {mod.lessons.map((l) => {
                      const Icon = LESSON_ICON[l.type];
                      const isActive = l.id === active.lessonId;
                      const done = completedSet.has(l.id);
                      const unlockAt = dripUnlockAt(enrollment.enrolledAt, l.dripDays);
                      const lessonIndex = flat.findIndex((item) => item.lessonId === l.id);
                      const locked = Boolean(
                        (unlockAt && unlockAt > new Date()) ||
                        (l.prerequisiteLessonId && !completedSet.has(l.prerequisiteLessonId)) ||
                        (enrollment.course.sequentialProgress && lessonIndex > 0 && !completedSet.has(flat[lessonIndex - 1].lessonId))
                      );
                      return (
                        <li key={l.id}>
                          <Link
                            href={`/learn/${enrollment.id}?lesson=${l.id}`}
                            className={cn(
                              "flex items-center gap-2 rounded-lg px-2 py-2 transition-colors",
                              isActive
                                ? "bg-zinc-950 text-white"
                                : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                            )}
                          >
                            {done ? (
                              <CheckCircle2
                                className={cn(
                                  "h-3.5 w-3.5 shrink-0",
                                  isActive
                                    ? "text-emerald-300"
                                    : "text-emerald-600"
                                )}
                              />
                            ) : locked ? (
                              <LockKeyhole
                                className={cn(
                                  "h-3.5 w-3.5 shrink-0",
                                  isActive ? "text-zinc-500" : "text-zinc-300"
                                )}
                              />
                            ) : (
                              <Circle
                                className={cn(
                                  "h-3.5 w-3.5 shrink-0",
                                  isActive ? "text-zinc-500" : "text-zinc-300"
                                )}
                              />
                            )}
                            <Icon
                              className={cn(
                                "h-3.5 w-3.5 shrink-0",
                                isActive ? "text-zinc-300" : "text-zinc-400"
                              )}
                            />
                            <span className="truncate">{l.title}</span>
                            {locked ? (
                              <span className="ml-auto shrink-0 text-[10px] opacity-70">
                                Day {l.dripDays}
                              </span>
                            ) : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                </li>
              ))}
            </ol>
          )}
        </aside>

        <main className="min-w-0 flex-1">
          {enrollment.course.liveSessions.length ? <div className="mb-4 space-y-2">{enrollment.course.liveSessions.map((session) => <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3"><div><p className="text-sm font-medium text-violet-950">{session.title}</p><p className="text-xs text-violet-700">{session.startsAt.toLocaleString("id-ID")} · {session.durationMinutes} minutes</p></div><Button asChild size="sm"><a href={session.replayUrl && session.startsAt < new Date() ? session.replayUrl : session.joinUrl} target="_blank" rel="noreferrer">{session.replayUrl && session.startsAt < new Date() ? "Watch replay" : "Join session"}</a></Button></div>)}</div> : null}
          {enrollment.course.announcements.length ? (
            <details className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-blue-950">
                Course announcements ({enrollment.course.announcements.length})
              </summary>
              <div className="mt-3 space-y-3">
                {enrollment.course.announcements.map((item) => (
                  <div key={item.id} className="border-t border-blue-200 pt-3 first:border-0 first:pt-0">
                    <p className="text-sm font-medium text-blue-950">{item.title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-blue-900/80">{item.body}</p>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          <div
            className={cn(
              "rounded-xl border border-zinc-200 bg-white p-5 md:p-7",
              isSingleLesson && "md:p-8"
            )}
          >
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <span className="font-medium uppercase tracking-wide">
                  {active.moduleTitle}
                </span>
                <span>·</span>
                <span>{LESSON_LABEL[active.type]}</span>
                <span>·</span>
                <span>
                  Lesson {activeIndex + 1} of {flat.length}
                </span>
              </div>
              <h1
                className={cn(
                  "font-semibold tracking-tight text-zinc-950",
                  isSingleLesson ? "text-3xl md:text-4xl" : "text-3xl"
                )}
              >
                {active.title}
              </h1>
            </div>

            <div className={cn("mt-7", isSingleLesson && "md:mt-8")}>
              {activeLocked ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-5 text-amber-950">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                      <CalendarClock className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">
                        Lesson belum terbuka
                      </p>
                      <p className="mt-1 text-sm leading-6 text-amber-900/80">
                        {activeUnlockAt && activeUnlockAt > new Date()
                          ? `Lesson ini dijadwalkan terbuka pada ${activeUnlockAt.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}.`
                          : "Selesaikan lesson prasyarat sebelum membuka materi ini."}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <LessonActivityTracker enrollmentId={enrollment.id} lessonId={active.lessonId} />
                  <LessonContent type={active.type} rawContent={active.content} enrollmentId={enrollment.id} lessonId={active.lessonId} asset={active.asset} transcript={active.transcript} attachmentLabel={active.attachmentLabel} />
                </>
              )}
            </div>

            {!activeLocked && quiz ? <div className="mt-6"><QuizPlayer enrollmentId={enrollment.id} quiz={quiz} /></div> : null}
            {!activeLocked && assignment ? <div className="mt-6"><AssignmentPanel enrollmentId={enrollment.id} assignment={assignment} /></div> : null}

            {!activeLocked ? <div className="mt-6 space-y-4"><LessonPersonalTools enrollmentId={enrollment.id} lessonId={active.lessonId} initialNote={note?.body ?? ""} initialBookmarked={Boolean(bookmark)} /><DiscussionPanel enrollmentId={enrollment.id} lessonId={active.lessonId} discussions={discussions} /></div> : null}

            {allDone ? (
              <div className="mt-8 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                <div>
                  <p className="font-medium">Course complete</p>
                  <p className="mt-1 text-emerald-800/80">
                    Semua lesson sudah selesai. Kamu tetap bisa mengulang materi
                    dari halaman ini.
                  </p>
                  {enrollment.certificate && !enrollment.certificate.revokedAt ? <Button asChild size="sm" className="mt-3"><Link href={`/certificates/${enrollment.certificate.verificationCode}`}>View certificate</Link></Button> : null}
                </div>
              </div>
            ) : null}

            {allDone ? <div className="mt-6"><CourseReviewPanel enrollmentId={enrollment.id} existing={review} /></div> : null}

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-6">
              {activeLocked ? (
                <Button disabled variant="outline">
                  <LockKeyhole className="h-4 w-4" />
                  Locked
                </Button>
              ) : (
                <LessonProgressToggle
                  enrollmentId={enrollment.id}
                  lessonId={active.lessonId}
                  completed={activeCompleted}
                />
              )}
              <div className="flex items-center gap-2">
                {prev ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/learn/${enrollment.id}?lesson=${prev.lessonId}`}>
                      <ChevronLeft /> Previous
                    </Link>
                  </Button>
                ) : null}
                {next ? (
                  <Button asChild size="sm">
                    <Link href={`/learn/${enrollment.id}?lesson=${next.lessonId}`}>
                      Next <ChevronRight />
                    </Link>
                  </Button>
                ) : (
                  <Button asChild variant="outline" size="sm">
                    <Link href={courseHref}>Back to course</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function dripUnlockAt(enrolledAt: Date, dripDays: number | null) {
  if (dripDays == null) return null;
  const date = new Date(enrolledAt);
  date.setDate(date.getDate() + dripDays);
  return date;
}
