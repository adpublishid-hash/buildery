"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { enrollmentSchema } from "@/lib/zod";
import { readEnrollments, writeEnrollments } from "@/lib/lms";
import { getActiveAffiliateFor } from "@/lib/affiliate";
import { generateMidtransOrderId } from "@/lib/payments";
import type { MetaCustomData, MetaStandardEventName } from "@/lib/meta-capi";
import {
  requestAdContext,
  sendWorkspaceAdEvent,
  toStoredAdContext,
} from "@/lib/ad-events";
import { splitName } from "@/lib/ad-match";
import { DEFAULT_AD_CURRENCY } from "@/lib/ad-catalog";
import { getMemberSession } from "@/lib/member-auth";
import { publicSiteHref } from "@/lib/public-url";
import {
  getOrCreateEcommerceSetting,
  getPaymentExpiry,
} from "@/lib/ecommerce-settings";
import {
  getActiveMembershipLevel,
  levelMeets,
  MEMBERSHIP_LEVEL_LABEL,
} from "@/lib/membership";
import { issuePublicAccessToken } from "@/lib/public-access-token";
import { recalculateEnrollmentProgress } from "@/lib/lms-progress";
import { queueCourseEmailNotification } from "@/lib/store-notifications";
import { reportError } from "@/lib/error-reporting";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** Either an instant (free) enrollment or one that needs payment first. */
type MetaActionEvent = {
  eventName: MetaStandardEventName;
  eventId: string;
  customData: MetaCustomData;
};

export type EnrollResult =
  | { mode: "enrolled"; enrollmentId: string; metaEvent?: MetaActionEvent }
  | {
      mode: "payment";
      paymentId: string;
      paymentAccessToken: string;
      metaEvent?: MetaActionEvent;
    }
  | {
      mode: "manual";
      enrollmentId: string;
      paymentId: string;
      paymentAccessToken: string;
      metaEvent?: MetaActionEvent;
    };

/**
 * Public enrollment. Free courses enrol instantly. Paid courses create a
 * PENDING enrollment + payment and return a payment id so the client can
 * start the Midtrans flow; the enrollment is activated on payment success.
 */
export async function enrollAction(
  workspaceSlug: string,
  courseSlug: string,
  formData: FormData
): Promise<ActionResult<EnrollResult>> {
  const parsed = enrollmentSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the form for errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const workspace = await prisma.workspace.findFirst({
    where: { slug: workspaceSlug, status: "ACTIVE" },
    select: { id: true },
  });
  if (!workspace) return { ok: false, error: "Workspace not found." };

  const course = await prisma.course.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: courseSlug } },
    select: {
      id: true,
      title: true,
      status: true,
      workspaceId: true,
      requiredLevel: true,
      isFree: true,
      price: true,
      accessDays: true,
      enrollmentLimit: true,
    },
  });
  if (!course || course.status !== "PUBLISHED" || course.workspaceId !== workspace.id) {
    return { ok: false, error: "This course is not available." };
  }

  const member = await getMemberSession(workspaceSlug);
  if (!member || member.workspaceId !== workspace.id) {
    return {
      ok: false,
      error: "Please create a member account or log in before enrolling.",
    };
  }

  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: member.customerId },
  });

  // Membership gate — for courses that require a higher level, the
  // customer must already have a matching active membership in this
  // workspace.
  if (course.requiredLevel !== "FREE") {
    const actual = await getActiveMembershipLevel(workspace.id, customer.id);
    if (!levelMeets(actual, course.requiredLevel)) {
      return {
        ok: false,
        error: `This course requires the ${MEMBERSHIP_LEVEL_LABEL[course.requiredLevel]} membership. Please contact the team to upgrade.`,
      };
    }
  }

  const existing = await prisma.enrollment.findUnique({
    where: {
      courseId_customerId: { courseId: course.id, customerId: customer.id },
    },
    include: { payment: true },
  });

  if (
    existing &&
    (existing.status === "ACTIVE" || existing.status === "COMPLETED") &&
    existing.accessExpiresAt &&
    existing.accessExpiresAt <= new Date()
  ) {
    return { ok: false, error: "Your access to this course has expired." };
  }

  // Completed courses remain accessible, and an existing pending checkout is
  // resumed instead of creating duplicate provider transactions.
  if (existing && (existing.status === "ACTIVE" || existing.status === "COMPLETED")) {
    const map = readEnrollments();
    map[course.id] = existing.id;
    writeEnrollments(map);
    return { ok: true, data: { mode: "enrolled", enrollmentId: existing.id } };
  }

  if (
    existing?.status === "PENDING" &&
    existing.payment?.status === "PENDING" &&
    (!existing.payment.expiresAt || existing.payment.expiresAt > new Date())
  ) {
    const accessToken = issuePublicAccessToken("payment", existing.payment.id);
    return {
      ok: true,
      data: {
        mode: existing.payment.provider.startsWith("manual:") ? "manual" : "payment",
        ...(existing.payment.provider.startsWith("manual:") ? { enrollmentId: existing.id } : {}),
        paymentId: existing.payment.id,
        paymentAccessToken: accessToken,
      },
    } as ActionResult<EnrollResult>;
  }

  const attribution = await getActiveAffiliateFor(workspace.id);

  // First-time enrollment + active referral cookie -> record a deduplicated LEAD.
  if (!existing) {
    if (attribution) {
      try {
        await prisma.referral.upsert({
          where: { dedupeKey: `lead:course:${course.id}:${customer.id}` },
          update: {},
          create: {
            affiliateId: attribution.affiliateId,
            workspaceId: workspace.id,
            event: "LEAD",
            dedupeKey: `lead:course:${course.id}:${customer.id}`,
            userAgent: headers().get("user-agent")?.slice(0, 500) ?? null,
          },
        });
      } catch (e) {
        reportError("enroll lead capture failed", e);
      }
    }
  }

  if (course.enrollmentLimit) {
    const occupied = await prisma.enrollment.count({
      where: { courseId: course.id, status: { in: ["ACTIVE", "COMPLETED"] } },
    });
    if (occupied >= course.enrollmentLimit) {
      return { ok: false, error: "This course has reached its enrollment limit." };
    }
  }

  const isPaid = !course.isFree && course.price > 0;
  const checkoutRequestId = String(formData.get("checkoutRequestId") ?? "").trim() || null;
  const couponResult = isPaid
    ? await validateCourseCoupon(workspace.id, course.id, customer.id, course.price, formData.get("couponCode"))
    : { discount: 0, code: null as string | null };
  if ("error" in couponResult) {
    return { ok: false, error: couponResult.error };
  }
  const total = Math.max(0, course.price - couponResult.discount);
  const accessExpiresAt = course.accessDays > 0
    ? new Date(Date.now() + course.accessDays * 24 * 60 * 60 * 1000)
    : null;
  const sourceUrl = publicSiteHref(workspaceSlug, `courses/${courseSlug}`);
  const courseMetaData = buildCourseMetaData(course);
  const customerData = {
    email: customer.email,
    phone: customer.phone,
    ...splitName(customer.name),
    externalId: customer.id,
  };
  const adContext = requestAdContext(sourceUrl);

  if (!isPaid || total === 0) {
    const enrollment = await prisma.$transaction(async (tx) => {
      const data = {
        status: "ACTIVE" as const,
        enrolledAt: new Date(),
        accessExpiresAt,
        checkoutRequestId,
        subtotal: isPaid ? course.price : 0,
        discount: isPaid ? couponResult.discount : 0,
        total: 0,
        couponCode: couponResult.code,
      };
      const active = existing
        ? await tx.enrollment.update({ where: { id: existing.id }, data })
        : await tx.enrollment.create({
            data: {
              workspaceId: workspace.id,
              courseId: course.id,
              customerId: customer.id,
              ...data,
            },
          });
      if (isPaid && couponResult.code) {
        await tx.coupon.updateMany({
          where: { workspaceId: workspace.id, code: couponResult.code, isActive: true },
          data: { uses: { increment: 1 } },
        });
      }
      return active;
    });
    const map = readEnrollments();
    map[course.id] = enrollment.id;
    writeEnrollments(map);
    const metaEvent = {
      eventName: "CompleteRegistration" as const,
      eventId: `complete_registration:enrollment:${enrollment.id}`,
      customData: { ...courseMetaData, status: "active" },
    };
    sendWorkspaceAdEvent(workspace.id, {
      ...metaEvent,
      ...adContext,
      customerData,
    }).catch((error) => {
      console.warn("Ad event CompleteRegistration failed", error);
    });
    queueCourseEmailNotification(prisma, {
      workspaceId: workspace.id,
      customerId: customer.id,
      recipient: customer.email,
      event: "COURSE_ENROLLED",
      subject: `Course access: ${course.title}`,
      body: `Hi ${customer.name}, your access to ${course.title} is now active.`,
    }).catch((error) => {
      console.warn("Course enrollment email failed", error);
    });
    revalidatePath(`/site/${workspaceSlug}/courses/${courseSlug}`);
    return {
      ok: true,
      data: { mode: "enrolled", enrollmentId: enrollment.id, metaEvent },
    };
  }

  // Paid course — PENDING enrollment + payment.
  const setting = await getOrCreateEcommerceSetting(workspace.id);
  const requestedMethod = String(formData.get("paymentMethod") ?? "midtrans");
  const manualMethod = requestedMethod === "midtrans" ? null : await prisma.manualPaymentMethod.findFirst({
    where: { id: requestedMethod, workspaceId: workspace.id, isActive: true },
  });
  if (requestedMethod !== "midtrans" && !manualMethod) {
    return { ok: false, error: "Selected payment method is unavailable." };
  }
  const enrollment = await prisma.$transaction(async (tx) => {
    if (existing?.payment) {
      await tx.payment.delete({ where: { id: existing.payment.id } });
    }
    const enrollmentData = {
      status: "PENDING" as const,
      enrolledAt: new Date(),
      accessExpiresAt,
      checkoutRequestId,
      couponCode: couponResult.code,
      subtotal: course.price,
      discount: couponResult.discount,
      total,
      payment: {
        create: {
          workspaceId: workspace.id,
          kind: "ENROLLMENT" as const,
          status: "PENDING" as const,
          provider: manualMethod ? `manual:${manualMethod.id}` : "midtrans",
          amount: total,
          midtransOrderId: generateMidtransOrderId("BDC"),
          description: `Course: ${course.title}`,
          expiresAt: getPaymentExpiry(setting),
          adContext: toStoredAdContext(adContext),
          referralAffiliateId: attribution?.affiliateId ?? null,
        },
      },
    };
    return existing
      ? tx.enrollment.update({
          where: { id: existing.id },
          data: enrollmentData,
          include: { payment: true },
        })
      : tx.enrollment.create({
          data: {
            workspaceId: workspace.id,
            courseId: course.id,
            customerId: customer.id,
            ...enrollmentData,
          },
          include: { payment: true },
        });
  });

  const map = readEnrollments();
  map[course.id] = enrollment.id;
  writeEnrollments(map);
  const metaEvent = {
    eventName: "InitiateCheckout" as const,
    eventId: `initiate_checkout:enrollment:${enrollment.id}`,
    customData: { ...courseMetaData, status: "pending" },
  };
  sendWorkspaceAdEvent(workspace.id, {
    ...metaEvent,
    ...adContext,
    customerData,
  }).catch((error) => {
    console.warn("Ad event course InitiateCheckout failed", error);
  });
  revalidatePath(`/site/${workspaceSlug}/courses/${courseSlug}`);
  return {
    ok: true,
    data: {
      mode: manualMethod ? "manual" : "payment",
      ...(manualMethod ? { enrollmentId: enrollment.id } : {}),
      paymentId: enrollment.payment!.id,
      paymentAccessToken: issuePublicAccessToken(
        "payment",
        enrollment.payment!.id
      ),
      metaEvent,
    },
  } as ActionResult<EnrollResult>;
}

/** Toggles a lesson's completion for the current enrollment. */
export async function toggleLessonProgressAction(
  enrollmentId: string,
  lessonId: string,
  completed: boolean
): Promise<ActionResult> {
  const member = await getMemberSession();
  if (!member) return { ok: false, error: "Please log in again." };

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
      enrolledAt: true,
      accessExpiresAt: true,
      course: { select: { sequentialProgress: true } },
    },
  });
  if (!enrollment) return { ok: false, error: "Active enrollment not found." };
  if (enrollment.accessExpiresAt && enrollment.accessExpiresAt <= new Date()) {
    return { ok: false, error: "Your access to this course has expired." };
  }

  // The lesson must belong to the enrollment's course.
  const lesson = await prisma.courseLesson.findUnique({
    where: { id: lessonId },
    include: { module: { select: { courseId: true } } },
  });
  if (!lesson || lesson.module.courseId !== enrollment.courseId) {
    return { ok: false, error: "Lesson not found in this course." };
  }
  if (isDripLocked(enrollment.enrolledAt, lesson.dripDays)) {
    return {
      ok: false,
      error: "This lesson is not unlocked yet.",
    };
  }

  if (completed) {
    const blocker = await lessonCompletionBlocker(enrollment, lessonId, lesson.prerequisiteLessonId);
    if (blocker) return { ok: false, error: blocker };
  }

  await prisma.$transaction(async (tx) => {
    if (completed) {
      await tx.lessonProgress.upsert({
        where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
        update: { completedAt: new Date(), progressPercent: 100, lastViewedAt: new Date() },
        create: {
          enrollmentId,
          lessonId,
          startedAt: new Date(),
          lastViewedAt: new Date(),
          completedAt: new Date(),
          progressPercent: 100,
        },
      });
    } else {
      await tx.lessonProgress.updateMany({
        where: { enrollmentId, lessonId },
        data: { completedAt: null, progressPercent: 0 },
      });
    }
    await recalculateEnrollmentProgress(tx, enrollmentId);
  });

  revalidatePath(`/learn/${enrollmentId}`);
  return { ok: true };
}

async function lessonCompletionBlocker(
  enrollment: {
    id: string;
    courseId: string;
    course: { sequentialProgress: boolean };
  },
  lessonId: string,
  prerequisiteLessonId: string | null
) {
  const requiredIds: string[] = [];
  if (prerequisiteLessonId) requiredIds.push(prerequisiteLessonId);
  if (enrollment.course.sequentialProgress) {
    const modules = await prisma.courseModule.findMany({
      where: { courseId: enrollment.courseId },
      select: { lessons: { select: { id: true }, orderBy: { order: "asc" } } },
      orderBy: { order: "asc" },
    });
    const ordered = modules.flatMap((item) => item.lessons.map((lesson) => lesson.id));
    const index = ordered.indexOf(lessonId);
    if (index > 0) requiredIds.push(ordered[index - 1]);
  }
  if (requiredIds.length) {
    const completedPrerequisites = await prisma.lessonProgress.count({
      where: {
        enrollmentId: enrollment.id,
        lessonId: { in: [...new Set(requiredIds)] },
        completedAt: { not: null },
      },
    });
    if (completedPrerequisites < new Set(requiredIds).size) {
      return "Complete the prerequisite lesson first.";
    }
  }

  const lesson = await prisma.courseLesson.findUnique({
    where: { id: lessonId },
    select: {
      quiz: { select: { id: true, attempts: { where: { enrollmentId: enrollment.id, passed: true }, take: 1 } } },
      assignment: {
        select: { submissions: { where: { enrollmentId: enrollment.id, status: "GRADED" }, take: 1 } },
      },
    },
  });
  if (lesson?.quiz && lesson.quiz.attempts.length === 0) return "Pass the quiz before completing this lesson.";
  if (lesson?.assignment && lesson.assignment.submissions.length === 0) return "Your assignment must be graded first.";
  return null;
}

async function validateCourseCoupon(
  workspaceId: string,
  courseId: string,
  customerId: string,
  subtotal: number,
  rawCode: FormDataEntryValue | null
): Promise<
  | { discount: number; code: string | null }
  | { error: string }
> {
  const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase() : "";
  if (!code) return { discount: 0, code: null as string | null };
  const coupon = await prisma.coupon.findUnique({
    where: { workspaceId_code: { workspaceId, code } },
  });
  const now = new Date();
  if (!coupon || !coupon.isActive) return { error: "Coupon is invalid or inactive." };
  if (coupon.startsAt && coupon.startsAt > now) return { error: "Coupon is not active yet." };
  if (coupon.expiresAt && coupon.expiresAt < now) return { error: "Coupon has expired." };
  if (coupon.courseIds.length && !coupon.courseIds.includes(courseId)) return { error: "Coupon does not apply to this course." };
  if (coupon.customerId && coupon.customerId !== customerId) return { error: "Coupon is assigned to another customer." };
  if (subtotal < coupon.minimumPurchase) return { error: "Course price does not meet the coupon minimum." };
  if (coupon.maxUses != null && coupon.uses >= coupon.maxUses) return { error: "Coupon usage limit has been reached." };
  if (coupon.maxUsesPerCustomer) {
    const used = await prisma.enrollment.count({
      where: { customerId, couponCode: code, payment: { status: "PAID" } },
    });
    if (used >= coupon.maxUsesPerCustomer) return { error: "You have reached this coupon's usage limit." };
  }
  const raw = coupon.type === "PERCENTAGE"
    ? Math.floor((subtotal * coupon.value) / 100)
    : coupon.value;
  return { discount: Math.min(subtotal, Math.max(0, raw)), code };
}

function isDripLocked(enrolledAt: Date, dripDays: number | null) {
  if (dripDays == null) return false;
  const unlockAt = new Date(enrolledAt);
  unlockAt.setDate(unlockAt.getDate() + dripDays);
  return unlockAt.getTime() > Date.now();
}

function buildCourseMetaData(course: {
  id: string;
  title: string;
  requiredLevel: keyof typeof MEMBERSHIP_LEVEL_LABEL;
  isFree: boolean;
  price: number;
}): MetaCustomData {
  const value = course.isFree ? 0 : course.price;
  return {
    content_ids: [course.id],
    content_name: course.title,
    content_type: "course",
    content_category: MEMBERSHIP_LEVEL_LABEL[course.requiredLevel],
    contents: [{ id: course.id, quantity: 1, item_price: value }],
    currency: DEFAULT_AD_CURRENCY,
    value,
  };
}
