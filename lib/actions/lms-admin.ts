"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { getCurrentWorkspace } from "@/lib/workspace";
import { recalculateEnrollmentProgress } from "@/lib/lms-progress";
import { applyPaymentStatus } from "@/lib/payments";
import { queueCourseEmailNotification } from "@/lib/store-notifications";
import {
  accessExpiryFrom,
  decideManualEnrollment,
  parseStudentRows,
  SEAT_STATUSES,
} from "@/lib/lms-enrollment-rules";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function editableWorkspace() {
  const session = await auth();
  if (!session?.user) return null;
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) return null;
  return { workspace: current.workspace, userId: session.user.id };
}

async function ownedCourse(courseId: string) {
  const caller = await editableWorkspace();
  if (!caller) return null;
  const course = await prisma.course.findFirst({
    where: { id: courseId, workspaceId: caller.workspace.id },
    select: { id: true, workspaceId: true },
  });
  return course ? { ...caller, course } : null;
}

export async function updateCourseAdvancedAction(courseId: string, formData: FormData): Promise<Result> {
  const caller = await ownedCourse(courseId);
  if (!caller) return { ok: false, error: "Course not found." };
  const categoryId = text(formData, "categoryId", 100);
  if (categoryId) {
    const category = await prisma.courseCategory.findFirst({
      where: { id: categoryId, workspaceId: caller.workspace.id },
    });
    if (!category) return { ok: false, error: "Category not found." };
  }
  const difficulty = text(formData, "difficulty", 20);
  if (!difficulty || !["BEGINNER", "INTERMEDIATE", "ADVANCED"].includes(difficulty)) {
    return { ok: false, error: "Invalid difficulty." };
  }
  const tags = text(formData, "tags", 1000)?.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 20) ?? [];
  await prisma.course.update({
    where: { id: courseId },
    data: {
      categoryId,
      instructorName: text(formData, "instructorName", 120),
      instructorBio: text(formData, "instructorBio", 2_000),
      difficulty: difficulty as "BEGINNER" | "INTERMEDIATE" | "ADVANCED",
      durationMinutes: int(formData, "durationMinutes", 0, 100_000),
      accessDays: int(formData, "accessDays", 0, 100_000),
      enrollmentLimit: optionalInt(formData, "enrollmentLimit", 1, 1_000_000),
      sequentialProgress: formData.get("sequentialProgress") === "on",
      certificateEnabled: formData.get("certificateEnabled") === "on",
      featured: formData.get("featured") === "on",
      tags,
      seoTitle: text(formData, "seoTitle", 160),
      metaDescription: text(formData, "metaDescription", 300),
    },
  });
  refreshCourse(courseId);
  return { ok: true };
}

export async function createCourseCategoryAction(formData: FormData): Promise<Result> {
  const caller = await editableWorkspace();
  if (!caller) return { ok: false, error: "Not allowed." };
  const name = text(formData, "name", 80);
  if (!name) return { ok: false, error: "Category name is required." };
  const slug = slugify(name);
  await prisma.courseCategory.upsert({
    where: { workspaceId_slug: { workspaceId: caller.workspace.id, slug } },
    update: { name },
    create: { workspaceId: caller.workspace.id, name, slug },
  });
  revalidatePath("/dashboard/courses/settings");
  return { ok: true };
}

export async function createCohortAction(courseId: string, formData: FormData): Promise<Result> {
  const caller = await ownedCourse(courseId);
  if (!caller) return { ok: false, error: "Course not found." };
  const name = text(formData, "name", 120);
  if (!name) return { ok: false, error: "Cohort name is required." };
  await prisma.courseCohort.create({
    data: {
      courseId,
      name,
      startsAt: date(formData, "startsAt"),
      endsAt: date(formData, "endsAt"),
      capacity: optionalInt(formData, "capacity", 1, 1_000_000),
    },
  });
  refreshCourse(courseId);
  return { ok: true };
}

export type BulkEnrollSummary = {
  created: number;
  reactivated: number;
  extended: number;
  unchanged: number;
  invalid: string[];
};

/**
 * Adds students by hand. Existing enrollments are never downgraded: completed
 * students keep their completion and longer access is not shortened. New
 * seats respect the course's enrollment limit, like public enrollment.
 */
export async function bulkEnrollCourseAction(
  courseId: string,
  formData: FormData
): Promise<Result<BulkEnrollSummary>> {
  const caller = await ownedCourse(courseId);
  if (!caller) return { ok: false, error: "Course not found." };
  const course = await prisma.course.findUniqueOrThrow({
    where: { id: courseId },
    select: { title: true, accessDays: true, enrollmentLimit: true },
  });
  const cohortId = text(formData, "cohortId", 100);
  if (cohortId) {
    const cohort = await prisma.courseCohort.findFirst({ where: { id: cohortId, courseId } });
    if (!cohort) return { ok: false, error: "Cohort not found." };
  }
  const { rows, invalid } = parseStudentRows(String(formData.get("students") ?? ""));
  if (!rows.length) {
    return { ok: false, error: invalid.length ? `No valid email found (${invalid.length} line(s) skipped).` : "Add at least one student email." };
  }

  const summary: BulkEnrollSummary = { created: 0, reactivated: 0, extended: 0, unchanged: 0, invalid };
  const welcome: { customerId: string; email: string; name: string }[] = [];
  try {
    await prisma.$transaction(async (tx) => {
      let seatsLeft = course.enrollmentLimit
        ? course.enrollmentLimit - (await tx.enrollment.count({ where: { courseId, status: { in: SEAT_STATUSES } } }))
        : Number.POSITIVE_INFINITY;
      for (const row of rows) {
        const customer = await tx.customer.upsert({
          where: { workspaceId_email: { workspaceId: caller.workspace.id, email: row.email } },
          update: {},
          create: { workspaceId: caller.workspace.id, email: row.email, name: row.name },
        });
        const existing = await tx.enrollment.findUnique({
          where: { courseId_customerId: { courseId, customerId: customer.id } },
          select: { id: true, status: true, accessExpiresAt: true },
        });
        const decision = decideManualEnrollment(existing, course.accessDays);
        if (decision.action === "create" || decision.action === "reactivate") {
          if (seatsLeft <= 0) throw new EnrollmentLimitError();
          seatsLeft -= 1;
        }
        if (decision.action === "create") {
          await tx.enrollment.create({
            data: { workspaceId: caller.workspace.id, courseId, customerId: customer.id, status: "ACTIVE", accessExpiresAt: decision.accessExpiresAt, cohortId },
          });
          summary.created += 1;
          welcome.push({ customerId: customer.id, email: customer.email, name: customer.name });
        } else if (decision.action === "reactivate") {
          await tx.enrollment.update({
            where: { id: existing!.id },
            data: { status: "ACTIVE", accessExpiresAt: decision.accessExpiresAt, ...(cohortId ? { cohortId } : {}) },
          });
          summary.reactivated += 1;
          welcome.push({ customerId: customer.id, email: customer.email, name: customer.name });
        } else if (decision.action === "extend") {
          await tx.enrollment.update({
            where: { id: existing!.id },
            data: { accessExpiresAt: decision.accessExpiresAt, ...(cohortId ? { cohortId } : {}) },
          });
          summary.extended += 1;
        } else {
          if (cohortId && existing) await tx.enrollment.update({ where: { id: existing.id }, data: { cohortId } });
          summary.unchanged += 1;
        }
      }
    });
  } catch (error) {
    if (error instanceof EnrollmentLimitError) {
      return { ok: false, error: `This course is limited to ${course.enrollmentLimit} students and has no seats left for everyone on the list. Nothing was changed.` };
    }
    throw error;
  }

  for (const student of welcome) {
    queueCourseEmailNotification(prisma, {
      workspaceId: caller.workspace.id,
      customerId: student.customerId,
      recipient: student.email,
      event: "COURSE_ENROLLED",
      subject: `Course access: ${course.title}`,
      body: `Hi ${student.name}, you now have access to ${course.title}.`,
    }).catch((error) => console.warn("Course enrollment email failed", error));
  }
  refreshCourse(courseId);
  return { ok: true, data: summary };
}

class EnrollmentLimitError extends Error {}

export async function createQuizAction(lessonId: string, formData: FormData): Promise<Result> {
  const lesson = await ownedLesson(lessonId);
  if (!lesson) return { ok: false, error: "Lesson not found." };
  const title = text(formData, "title", 160);
  if (!title) return { ok: false, error: "Quiz title is required." };
  await prisma.courseQuiz.upsert({
    where: { lessonId },
    update: {
      title,
      description: text(formData, "description", 2_000),
      passScore: int(formData, "passScore", 1, 100),
      maxAttempts: int(formData, "maxAttempts", 0, 100),
      shuffleQuestions: formData.get("shuffleQuestions") === "on",
    },
    create: {
      lessonId,
      title,
      description: text(formData, "description", 2_000),
      passScore: int(formData, "passScore", 1, 100),
      maxAttempts: int(formData, "maxAttempts", 0, 100),
      shuffleQuestions: formData.get("shuffleQuestions") === "on",
    },
  });
  refreshCourse(lesson.courseId);
  return { ok: true };
}

export async function addQuizQuestionAction(quizId: string, formData: FormData): Promise<Result> {
  const quiz = await prisma.courseQuiz.findUnique({
    where: { id: quizId },
    select: { lesson: { select: { module: { select: { courseId: true } } } }, _count: { select: { questions: true } } },
  });
  if (!quiz || !(await ownedCourse(quiz.lesson.module.courseId))) return { ok: false, error: "Quiz not found." };
  const prompt = text(formData, "prompt", 2_000);
  if (!prompt) return { ok: false, error: "Question is required." };
  const type = text(formData, "type", 30) ?? "SINGLE_CHOICE";
  const options = (text(formData, "options", 4_000) ?? "").split("\n").map((item) => item.trim()).filter(Boolean);
  const correct = (text(formData, "correctAnswer", 2_000) ?? "").split("|").map((item) => item.trim()).filter(Boolean);
  if (!correct.length) return { ok: false, error: "Correct answer is required." };
  await prisma.quizQuestion.create({
    data: {
      quizId,
      prompt,
      type: type as "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_TEXT",
      options,
      correctAnswer: correct,
      explanation: text(formData, "explanation", 2_000),
      points: int(formData, "points", 1, 100),
      order: quiz._count.questions,
    },
  });
  refreshCourse(quiz.lesson.module.courseId);
  return { ok: true };
}

export async function createAssignmentAction(lessonId: string, formData: FormData): Promise<Result> {
  const lesson = await ownedLesson(lessonId);
  if (!lesson) return { ok: false, error: "Lesson not found." };
  const title = text(formData, "title", 160);
  const instructions = text(formData, "instructions", 10_000);
  if (!title || !instructions) return { ok: false, error: "Title and instructions are required." };
  await prisma.courseAssignment.upsert({
    where: { lessonId },
    update: { title, instructions, maxScore: int(formData, "maxScore", 1, 10_000) },
    create: { lessonId, title, instructions, maxScore: int(formData, "maxScore", 1, 10_000) },
  });
  refreshCourse(lesson.courseId);
  return { ok: true };
}

export async function gradeAssignmentAction(submissionId: string, formData: FormData): Promise<Result> {
  const submission = await prisma.assignmentSubmission.findUnique({
    where: { id: submissionId },
    select: {
      enrollmentId: true,
      status: true,
      assignment: { select: { maxScore: true, lessonId: true, lesson: { select: { module: { select: { courseId: true } } } } } },
    },
  });
  const caller = submission ? await ownedCourse(submission.assignment.lesson.module.courseId) : null;
  if (!submission || !caller) return { ok: false, error: "Submission not found." };
  // Drafts and work sent back for revision aren't ready; a grade can be corrected later.
  if (submission.status !== "SUBMITTED" && submission.status !== "GRADED") {
    return { ok: false, error: "This submission isn't waiting for a grade." };
  }
  if (String(formData.get("score") ?? "").trim() === "") return { ok: false, error: "Enter a score." };
  const score = int(formData, "score", 0, submission.assignment.maxScore);
  await prisma.$transaction(async (tx) => {
    await tx.assignmentSubmission.update({
      where: { id: submissionId },
      data: { score, feedback: text(formData, "feedback", 5_000), status: "GRADED", gradedAt: new Date(), gradedById: caller.userId },
    });
    await tx.lessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId: submission.enrollmentId, lessonId: submission.assignment.lessonId } },
      update: { completedAt: new Date(), progressPercent: 100 },
      create: { enrollmentId: submission.enrollmentId, lessonId: submission.assignment.lessonId, startedAt: new Date(), completedAt: new Date(), progressPercent: 100 },
    });
    await recalculateEnrollmentProgress(tx, submission.enrollmentId);
  });
  refreshCourse(submission.assignment.lesson.module.courseId);
  return { ok: true };
}

/**
 * Sends work back for another attempt with feedback. The lesson stays
 * incomplete and the learner can resubmit.
 */
export async function returnAssignmentAction(submissionId: string, formData: FormData): Promise<Result> {
  const submission = await prisma.assignmentSubmission.findUnique({
    where: { id: submissionId },
    select: { status: true, assignment: { select: { lesson: { select: { module: { select: { courseId: true } } } } } } },
  });
  const caller = submission ? await ownedCourse(submission.assignment.lesson.module.courseId) : null;
  if (!submission || !caller) return { ok: false, error: "Submission not found." };
  if (submission.status !== "SUBMITTED") return { ok: false, error: "Only submitted work can be returned." };
  const feedback = text(formData, "feedback", 5_000);
  if (!feedback) return { ok: false, error: "Tell the learner what to change." };
  await prisma.assignmentSubmission.update({
    where: { id: submissionId },
    data: { status: "RETURNED", feedback, score: null, gradedAt: new Date(), gradedById: caller.userId },
  });
  refreshCourse(submission.assignment.lesson.module.courseId);
  return { ok: true };
}

export async function createAnnouncementAction(courseId: string, formData: FormData): Promise<Result> {
  const caller = await ownedCourse(courseId);
  if (!caller) return { ok: false, error: "Course not found." };
  const title = text(formData, "title", 160);
  const body = text(formData, "body", 10_000);
  if (!title || !body) return { ok: false, error: "Title and message are required." };
  await prisma.courseAnnouncement.create({ data: { courseId, title, body, publishedAt: new Date() } });
  const recipients = await prisma.enrollment.findMany({
    where: { courseId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { customerId: true, customer: { select: { email: true } }, course: { select: { title: true } } },
    take: 500,
  });
  await Promise.allSettled(recipients.map((item) => queueCourseEmailNotification(prisma, {
    workspaceId: caller.workspace.id,
    customerId: item.customerId,
    recipient: item.customer.email,
    event: "COURSE_ANNOUNCEMENT",
    subject: `${item.course.title}: ${title}`,
    body,
  })));
  refreshCourse(courseId);
  return { ok: true };
}

export async function createLiveSessionAction(courseId: string, formData: FormData): Promise<Result> {
  if (!(await ownedCourse(courseId))) return { ok: false, error: "Course not found." };
  const title = text(formData, "title", 160);
  const startsAt = date(formData, "startsAt");
  const joinUrl = safeUrl(text(formData, "joinUrl", 1_000));
  if (!title || !startsAt || !joinUrl) return { ok: false, error: "Title, start time, and a valid join URL are required." };
  await prisma.courseLiveSession.create({ data: { courseId, title, startsAt, joinUrl, description: text(formData, "description", 2_000), durationMinutes: int(formData, "durationMinutes", 1, 1_440), replayUrl: safeUrl(text(formData, "replayUrl", 1_000)) } });
  refreshCourse(courseId);
  return { ok: true };
}

export async function duplicateCourseAction(courseId: string): Promise<Result> {
  const caller = await ownedCourse(courseId);
  if (!caller) return { ok: false, error: "Course not found." };
  const source = await prisma.course.findUnique({ where: { id: courseId }, include: { modules: { orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" } } } } } });
  if (!source) return { ok: false, error: "Course not found." };
  let slug = `${source.slug}-copy`;
  let suffix = 2;
  while (await prisma.course.findUnique({ where: { workspaceId_slug: { workspaceId: source.workspaceId, slug } }, select: { id: true } })) slug = `${source.slug}-copy-${suffix++}`;
  await prisma.course.create({
    data: {
      workspaceId: source.workspaceId,
      imageId: source.imageId,
      title: `${source.title} Copy`, slug, summary: source.summary, description: source.description,
      status: "DRAFT", isFree: source.isFree, price: source.price, requiredLevel: source.requiredLevel,
      categoryId: source.categoryId, instructorName: source.instructorName, instructorBio: source.instructorBio,
      difficulty: source.difficulty, durationMinutes: source.durationMinutes, accessDays: source.accessDays,
      enrollmentLimit: source.enrollmentLimit, sequentialProgress: source.sequentialProgress,
      certificateEnabled: source.certificateEnabled, tags: source.tags, seoTitle: source.seoTitle, metaDescription: source.metaDescription,
      modules: { create: source.modules.map((module) => ({ title: module.title, order: module.order, lessons: { create: module.lessons.map((lesson) => ({ title: lesson.title, type: lesson.type, order: lesson.order, content: lesson.content as object, isPreview: lesson.isPreview, dripDays: lesson.dripDays, durationMinutes: lesson.durationMinutes, transcript: lesson.transcript, attachmentLabel: lesson.attachmentLabel })) } })) },
    },
  });
  revalidatePath("/dashboard/courses");
  return { ok: true };
}

export async function updateEnrollmentAdminAction(enrollmentId: string, formData: FormData): Promise<Result> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { courseId: true, course: { select: { accessDays: true } } },
  });
  const caller = enrollment ? await ownedCourse(enrollment.courseId) : null;
  if (!enrollment || !caller) return { ok: false, error: "Enrollment not found." };
  const operation = text(formData, "operation", 30);
  if (operation === "RESET") {
    await prisma.$transaction([
      prisma.lessonProgress.deleteMany({ where: { enrollmentId } }),
      prisma.quizAttempt.deleteMany({ where: { enrollmentId } }),
      prisma.enrollment.update({ where: { id: enrollmentId }, data: { status: "ACTIVE", completedAt: null, progressPercent: 0, totalTimeSeconds: 0, finalScore: null, lastLessonId: null } }),
      prisma.courseCertificate.updateMany({ where: { enrollmentId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  } else if (operation === "CANCEL") {
    await prisma.$transaction([
      prisma.enrollment.update({ where: { id: enrollmentId }, data: { status: "CANCELLED" } }),
      prisma.courseCertificate.updateMany({ where: { enrollmentId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  } else if (operation === "ACTIVATE") {
    // Without an explicit date, grant the course's normal access period
    // (lifetime only when the course itself is lifetime).
    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { status: "ACTIVE", accessExpiresAt: date(formData, "accessExpiresAt") ?? accessExpiryFrom(enrollment.course.accessDays) },
    });
  } else {
    return { ok: false, error: "Unknown operation." };
  }
  refreshCourse(enrollment.courseId);
  return { ok: true };
}

export async function moderateCourseReviewAction(reviewId: string, approved: boolean): Promise<Result> {
  const review = await prisma.courseReview.findUnique({ where: { id: reviewId }, select: { courseId: true } });
  if (!review || !(await ownedCourse(review.courseId))) return { ok: false, error: "Review not found." };
  await prisma.courseReview.update({ where: { id: reviewId }, data: { status: approved ? "APPROVED" : "REJECTED" } });
  refreshCourse(review.courseId);
  return { ok: true };
}

export async function reviewEnrollmentPaymentProofAction(paymentId: string, approved: boolean): Promise<Result> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, status: true, provider: true, manualProofUrl: true, manualProofStatus: true, enrollment: { select: { courseId: true } } },
  });
  const caller = payment?.enrollment ? await ownedCourse(payment.enrollment.courseId) : null;
  if (!payment || !caller) return { ok: false, error: "Payment not found." };
  if (!payment.provider.startsWith("manual:") || !payment.manualProofUrl || payment.manualProofStatus !== "PENDING") {
    return { ok: false, error: "Payment proof is not ready for review." };
  }
  if (approved) {
    if (payment.status !== "PENDING") return { ok: false, error: "Payment already has a final status." };
    await applyPaymentStatus(payment.id, "PAID", { transactionStatus: "manual_verified", paymentType: "manual_transfer" });
  }
  await prisma.payment.update({
    where: { id: payment.id },
    data: { manualProofStatus: approved ? "VERIFIED" : "REJECTED", manualProofReviewedAt: new Date(), manualProofReviewedById: caller.userId },
  });
  refreshCourse(payment.enrollment!.courseId);
  return { ok: true };
}

async function ownedLesson(lessonId: string) {
  const lesson = await prisma.courseLesson.findUnique({
    where: { id: lessonId },
    select: { module: { select: { courseId: true } } },
  });
  if (!lesson || !(await ownedCourse(lesson.module.courseId))) return null;
  return { courseId: lesson.module.courseId };
}

function text(formData: FormData, key: string, max: number) {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value.slice(0, max) : null;
}

function int(formData: FormData, key: string, min: number, max: number) {
  const value = Number(formData.get(key));
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min;
}

function optionalInt(formData: FormData, key: string, min: number, max: number) {
  const raw = String(formData.get(key) ?? "").trim();
  return raw ? int(formData, key, min, max) : null;
}

function date(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const value = new Date(raw);
  return Number.isNaN(value.getTime()) ? null : value;
}

function safeUrl(value: string | null) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.href : null; } catch { return null; }
}

function refreshCourse(courseId: string) {
  revalidatePath("/dashboard/courses/students");
  revalidatePath("/dashboard/courses/grading");
  revalidatePath(`/dashboard/courses/${courseId}/tools`);
  revalidatePath(`/dashboard/courses/${courseId}/students`);
  revalidatePath(`/dashboard/courses/${courseId}/insights`);
  revalidatePath(`/dashboard/courses/${courseId}/edit`);
  revalidatePath("/dashboard/courses");
}
