"use server";

import { revalidatePath } from "next/cache";

import { getMemberSession } from "@/lib/member-auth";
import { prisma } from "@/lib/prisma";
import { recalculateEnrollmentProgress } from "@/lib/lms-progress";
import { hasRequiredMembership } from "@/lib/membership";

type Result<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

async function learnerEnrollment(enrollmentId: string) {
  const member = await getMemberSession();
  if (!member) return null;
  const enrollment = await prisma.enrollment.findFirst({
    where: {
      id: enrollmentId,
      customerId: member.customerId,
      workspaceId: member.workspaceId,
      status: { in: ["ACTIVE", "COMPLETED"] },
    },
    select: {
      id: true,
      courseId: true,
      customerId: true,
      startedAt: true,
      accessExpiresAt: true,
      enrolledAt: true,
      workspaceId: true,
      course: { select: { sequentialProgress: true, requiredLevel: true } },
    },
  });
  if (!enrollment) return null;
  if (enrollment.accessExpiresAt && enrollment.accessExpiresAt <= new Date()) return null;
  if (!(await hasRequiredMembership(enrollment.workspaceId, enrollment.customerId, enrollment.course.requiredLevel))) return null;
  return enrollment;
}

async function lessonBelongsToCourse(lessonId: string, courseId: string) {
  return prisma.courseLesson.findFirst({
    where: { id: lessonId, module: { courseId } },
    select: { id: true, dripDays: true, prerequisiteLessonId: true, quiz: { select: { id: true } }, assignment: { select: { id: true } } },
  });
}

export async function trackLessonActivityAction(
  enrollmentId: string,
  lessonId: string,
  seconds: number,
  progressPercent = 0
): Promise<Result> {
  const enrollment = await learnerEnrollment(enrollmentId);
  if (!enrollment) return { ok: false, error: "Course access is unavailable." };
  const lesson = await lessonBelongsToCourse(lessonId, enrollment.courseId);
  if (!lesson) return { ok: false, error: "Lesson not found." };

  const now = new Date();
  const unlockAt = new Date(enrollment.enrolledAt);
  unlockAt.setDate(unlockAt.getDate() + (lesson.dripDays ?? 0));
  if (lesson.dripDays != null && unlockAt > now) {
    return { ok: false, error: "Lesson is still locked." };
  }

  const safeSeconds = Math.min(300, Math.max(0, Math.round(seconds)));
  const safePercent = Math.min(100, Math.max(0, Math.round(progressPercent)));
  const current = await prisma.lessonProgress.findUnique({
    where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    select: { progressPercent: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.lessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
      update: {
        lastViewedAt: now,
        timeSpentSeconds: { increment: safeSeconds },
        progressPercent: Math.max(current?.progressPercent ?? 0, safePercent),
        ...(!lesson.quiz && !lesson.assignment && safePercent >= 95 ? { completedAt: now } : {}),
      },
      create: {
        enrollmentId,
        lessonId,
        startedAt: now,
        lastViewedAt: now,
        timeSpentSeconds: safeSeconds,
        progressPercent: safePercent,
        ...(!lesson.quiz && !lesson.assignment && safePercent >= 95 ? { completedAt: now } : {}),
      },
    });
    await tx.enrollment.update({
      where: { id: enrollmentId },
      data: {
        startedAt: enrollment.startedAt ?? now,
        lastAccessedAt: now,
        lastLessonId: lessonId,
        totalTimeSeconds: { increment: safeSeconds },
      },
    });
    if (!lesson.quiz && !lesson.assignment && safePercent >= 95) {
      await recalculateEnrollmentProgress(tx, enrollmentId, now);
    }
  });
  return { ok: true };
}

export async function saveCourseNoteAction(
  enrollmentId: string,
  lessonId: string,
  body: string
): Promise<Result> {
  const enrollment = await learnerEnrollment(enrollmentId);
  if (!enrollment || !(await lessonBelongsToCourse(lessonId, enrollment.courseId))) {
    return { ok: false, error: "Lesson access is unavailable." };
  }
  const clean = body.trim().slice(0, 10_000);
  if (!clean) {
    await prisma.courseNote.deleteMany({ where: { lessonId, customerId: enrollment.customerId } });
  } else {
    await prisma.courseNote.upsert({
      where: { lessonId_customerId: { lessonId, customerId: enrollment.customerId } },
      update: { body: clean },
      create: { lessonId, customerId: enrollment.customerId, body: clean },
    });
  }
  revalidatePath(`/learn/${enrollmentId}`);
  return { ok: true };
}

export async function toggleLessonBookmarkAction(
  enrollmentId: string,
  lessonId: string,
  bookmarked: boolean
): Promise<Result> {
  const enrollment = await learnerEnrollment(enrollmentId);
  if (!enrollment || !(await lessonBelongsToCourse(lessonId, enrollment.courseId))) {
    return { ok: false, error: "Lesson access is unavailable." };
  }
  if (bookmarked) {
    await prisma.lessonBookmark.upsert({
      where: { lessonId_customerId: { lessonId, customerId: enrollment.customerId } },
      update: {},
      create: { lessonId, customerId: enrollment.customerId },
    });
  } else {
    await prisma.lessonBookmark.deleteMany({ where: { lessonId, customerId: enrollment.customerId } });
  }
  revalidatePath(`/learn/${enrollmentId}`);
  return { ok: true };
}

export async function postCourseDiscussionAction(
  enrollmentId: string,
  lessonId: string,
  body: string,
  parentId?: string
): Promise<Result> {
  const enrollment = await learnerEnrollment(enrollmentId);
  if (!enrollment || !(await lessonBelongsToCourse(lessonId, enrollment.courseId))) {
    return { ok: false, error: "Lesson access is unavailable." };
  }
  const clean = body.trim().slice(0, 4_000);
  if (!clean) return { ok: false, error: "Write a message first." };
  if (parentId) {
    const parent = await prisma.courseDiscussion.findFirst({ where: { id: parentId, lessonId } });
    if (!parent) return { ok: false, error: "Discussion thread not found." };
  }
  await prisma.courseDiscussion.create({
    data: { lessonId, customerId: enrollment.customerId, body: clean, parentId: parentId || null },
  });
  revalidatePath(`/learn/${enrollmentId}`);
  return { ok: true };
}

export async function submitQuizAction(
  enrollmentId: string,
  quizId: string,
  answers: Record<string, string[]>
): Promise<Result<{ score: number; passed: boolean; attempt: number }>> {
  const enrollment = await learnerEnrollment(enrollmentId);
  if (!enrollment) return { ok: false, error: "Course access is unavailable." };
  const quiz = await prisma.courseQuiz.findFirst({
    where: { id: quizId, lesson: { module: { courseId: enrollment.courseId } } },
    include: { questions: { orderBy: { order: "asc" } }, attempts: { where: { enrollmentId } } },
  });
  if (!quiz) return { ok: false, error: "Quiz not found." };
  if (quiz.maxAttempts > 0 && quiz.attempts.length >= quiz.maxAttempts) {
    return { ok: false, error: "Maximum quiz attempts reached." };
  }

  let earned = 0;
  const total = quiz.questions.reduce((sum, item) => sum + item.points, 0);
  for (const question of quiz.questions) {
    const expected = normalizeAnswers(question.correctAnswer);
    const received = normalizeAnswers(answers[question.id] ?? []);
    if (expected.length === received.length && expected.every((value, index) => value === received[index])) {
      earned += question.points;
    }
  }
  const score = total ? Math.round((earned / total) * 100) : 0;
  const passed = score >= quiz.passScore;

  await prisma.$transaction(async (tx) => {
    await tx.quizAttempt.create({
      data: { quizId, enrollmentId, customerId: enrollment.customerId, score, passed, answers },
    });
    if (passed) {
      await tx.lessonProgress.upsert({
        where: { enrollmentId_lessonId: { enrollmentId, lessonId: quiz.lessonId } },
        update: { completedAt: new Date(), progressPercent: 100, lastViewedAt: new Date() },
        create: {
          enrollmentId,
          lessonId: quiz.lessonId,
          startedAt: new Date(),
          lastViewedAt: new Date(),
          completedAt: new Date(),
          progressPercent: 100,
        },
      });
      await recalculateEnrollmentProgress(tx, enrollmentId);
    }
    const best = Math.max(score, ...quiz.attempts.map((attempt) => attempt.score));
    await tx.enrollment.update({ where: { id: enrollmentId }, data: { finalScore: best } });
  });
  revalidatePath(`/learn/${enrollmentId}`);
  return { ok: true, data: { score, passed, attempt: quiz.attempts.length + 1 } };
}

export async function submitAssignmentAction(
  enrollmentId: string,
  assignmentId: string,
  submissionText: string,
  fileUrl?: string
): Promise<Result> {
  const enrollment = await learnerEnrollment(enrollmentId);
  if (!enrollment) return { ok: false, error: "Course access is unavailable." };
  const assignment = await prisma.courseAssignment.findFirst({
    where: { id: assignmentId, lesson: { module: { courseId: enrollment.courseId } } },
  });
  if (!assignment) return { ok: false, error: "Assignment not found." };
  const text = submissionText.trim().slice(0, 20_000);
  const url = safeHttpUrl(fileUrl);
  if (!text && !url) return { ok: false, error: "Add an answer or file URL." };
  await prisma.assignmentSubmission.upsert({
    where: { assignmentId_enrollmentId: { assignmentId, enrollmentId } },
    update: { submissionText: text || null, fileUrl: url, status: "SUBMITTED", submittedAt: new Date() },
    create: {
      assignmentId,
      enrollmentId,
      customerId: enrollment.customerId,
      submissionText: text || null,
      fileUrl: url,
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
  });
  revalidatePath(`/learn/${enrollmentId}`);
  return { ok: true };
}

export async function submitCourseReviewAction(
  enrollmentId: string,
  rating: number,
  title: string,
  body: string
): Promise<Result> {
  const enrollment = await learnerEnrollment(enrollmentId);
  if (!enrollment) return { ok: false, error: "Course access is unavailable." };
  const safeRating = Math.min(5, Math.max(1, Math.round(rating)));
  await prisma.courseReview.upsert({
    where: { courseId_customerId: { courseId: enrollment.courseId, customerId: enrollment.customerId } },
    update: { rating: safeRating, title: title.trim().slice(0, 120) || null, body: body.trim().slice(0, 4_000) || null, status: "PENDING" },
    create: {
      workspaceId: (await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollmentId }, select: { workspaceId: true } })).workspaceId,
      courseId: enrollment.courseId,
      customerId: enrollment.customerId,
      rating: safeRating,
      title: title.trim().slice(0, 120) || null,
      body: body.trim().slice(0, 4_000) || null,
    },
  });
  return { ok: true };
}

function normalizeAnswers(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim().toLowerCase()).sort();
  if (typeof value === "string") return [value.trim().toLowerCase()];
  if (typeof value === "boolean") return [String(value)];
  return [];
}

function safeHttpUrl(value?: string) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
