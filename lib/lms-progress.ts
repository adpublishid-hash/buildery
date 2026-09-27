import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";

import { queueCourseEmailNotification } from "@/lib/store-notifications";

type TransactionClient = Prisma.TransactionClient;

export function deriveEnrollmentProgress(total: number, completed: number) {
  const safeTotal = Math.max(0, total);
  const safeCompleted = Math.min(safeTotal, Math.max(0, completed));
  return {
    percent: safeTotal === 0 ? 0 : Math.round((safeCompleted / safeTotal) * 100),
    complete: safeTotal > 0 && safeCompleted === safeTotal,
  };
}

export async function recalculateEnrollmentProgress(
  tx: TransactionClient,
  enrollmentId: string,
  now = new Date()
) {
  const enrollment = await tx.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      status: true,
      courseId: true,
      customer: { select: { id: true, name: true, email: true } },
      workspaceId: true,
      course: {
        select: {
          title: true,
          certificateEnabled: true,
          _count: { select: { modules: true } },
        },
      },
    },
  });
  if (!enrollment) return null;

  const [total, completed] = await Promise.all([
    tx.courseLesson.count({ where: { module: { courseId: enrollment.courseId } } }),
    tx.lessonProgress.count({
      where: {
        enrollmentId,
        completedAt: { not: null },
        lesson: { module: { courseId: enrollment.courseId } },
      },
    }),
  ]);
  const result = deriveEnrollmentProgress(total, completed);
  const shouldComplete = result.complete && enrollment.status === "ACTIVE";
  const shouldReopen = !result.complete && enrollment.status === "COMPLETED";

  await tx.enrollment.update({
    where: { id: enrollmentId },
    data: {
      progressPercent: result.percent,
      ...(shouldComplete ? { status: "COMPLETED", completedAt: now } : {}),
      ...(shouldReopen ? { status: "ACTIVE", completedAt: null } : {}),
    },
  });

  if (shouldComplete && enrollment.course.certificateEnabled) {
    await tx.courseCertificate.upsert({
      where: { enrollmentId },
      update: { revokedAt: null },
      create: {
        enrollmentId,
        verificationCode: certificateCode(),
        recipientName: enrollment.customer.name,
        courseTitle: enrollment.course.title,
        issuedAt: now,
      },
    });
  }
  if (shouldComplete) {
    await queueCourseEmailNotification(tx, {
      workspaceId: enrollment.workspaceId,
      customerId: enrollment.customer.id,
      recipient: enrollment.customer.email,
      event: "COURSE_COMPLETED",
      subject: `Course completed: ${enrollment.course.title}`,
      body: `Congratulations ${enrollment.customer.name}, you have completed ${enrollment.course.title}.`,
    });
  }
  if (shouldReopen) {
    await tx.courseCertificate.updateMany({
      where: { enrollmentId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  return { ...result, status: shouldComplete ? "COMPLETED" : shouldReopen ? "ACTIVE" : enrollment.status };
}

function certificateCode() {
  return `CERT-${randomBytes(6).toString("hex").toUpperCase()}`;
}
