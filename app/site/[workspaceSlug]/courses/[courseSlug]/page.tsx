import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Eye,
  GraduationCap,
  Layers,
  LockKeyhole,
  PlayCircle,
  Star,
  Users,
} from "lucide-react";

import { publicSiteContextHref } from "@/lib/public-url-server";
import { prisma } from "@/lib/prisma";
import type { MetaCustomData } from "@/lib/meta-capi";
import { getWorkspaceAdCurrency } from "@/lib/ad-events";
import { formatPrice, getStoreWorkspace } from "@/lib/store";
import { resolveContent } from "@/lib/storefront-content";
import { getPageContent } from "@/lib/storefront-content-server";
import { getMemberSession } from "@/lib/member-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StoreHeader } from "@/components/store/store-header";
import { EnrollmentForm } from "@/components/learn/enrollment-form";
import { LessonContent } from "@/components/learn/lesson-content";
import { MEMBERSHIP_LEVEL_LABEL } from "@/lib/labels";
import { MetaEventTracker } from "@/components/site/meta-event-tracker";
import { issueMetaEventAuthorization } from "@/lib/meta-event-auth";

export const dynamic = "force-dynamic";

type Params = { workspaceSlug: string; courseSlug: string };

async function load(params: Params) {
  const workspace = await getStoreWorkspace(params.workspaceSlug);
  if (!workspace) return null;
  const course = await prisma.course.findUnique({
    where: {
      workspaceId_slug: { workspaceId: workspace.id, slug: params.courseSlug },
    },
    include: {
      image: true,
      modules: {
        include: {
          _count: { select: { lessons: true } },
          lessons: {
            select: {
              id: true,
              title: true,
              type: true,
              content: true,
              isPreview: true,
              dripDays: true,
            },
            orderBy: { order: "asc" },
          },
        },
        orderBy: { order: "asc" },
      },
      _count: { select: { enrollments: true } },
      category: { select: { name: true } },
      reviews: { where: { status: "APPROVED" }, include: { customer: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!course || course.status !== "PUBLISHED") return null;
  const membershipPlans =
    course.requiredLevel === "FREE"
      ? []
      : await prisma.membershipPlan.findMany({
          where: {
            workspaceId: workspace.id,
            level: course.requiredLevel,
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            slug: true,
          },
          orderBy: { createdAt: "asc" },
        });

  const manualPaymentMethods = await prisma.manualPaymentMethod.findMany({
    where: { workspaceId: workspace.id, isActive: true },
    select: { id: true, name: true, type: true },
    orderBy: { createdAt: "asc" },
  });
  return { workspace, course, membershipPlans, manualPaymentMethods };
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const result = await load(params);
  if (!result) return { title: "Course not found" };
  return {
    title: { absolute: result.course.seoTitle || `${result.course.title} · ${result.workspace.name}` },
    description: result.course.metaDescription || result.course.summary || undefined,
    alternates: { canonical: publicSiteContextHref(result.workspace.slug, `courses/${result.course.slug}`) },
    openGraph: {
      title: result.course.seoTitle || result.course.title,
      description: result.course.metaDescription || result.course.summary || undefined,
      images: result.course.image?.url ? [{ url: result.course.image.url }] : undefined,
      type: "website",
    },
  };
}

export default async function PublicCoursePage({
  params,
}: {
  params: Params;
}) {
  const result = await load(params);
  if (!result) notFound();
  const { workspace, course, membershipPlans, manualPaymentMethods } = result;
  const member = await getMemberSession(workspace.slug);
  const content = resolveContent(
    "courses_single",
    await getPageContent(workspace.id, "courses_single"),
    {
      curriculumHeading: "Curriculum",
      enrollFreeLabel: "Enroll for free",
      enrollPaidLabel: "Get access",
    }
  );

  const memberEnrollment = member ? await prisma.enrollment.findUnique({
    where: { courseId_customerId: { courseId: course.id, customerId: member.customerId } },
    select: { id: true, status: true, lastLessonId: true, accessExpiresAt: true },
  }) : null;
  const enrollmentId = memberEnrollment && ["ACTIVE", "COMPLETED"].includes(memberEnrollment.status) && (!memberEnrollment.accessExpiresAt || memberEnrollment.accessExpiresAt > new Date()) ? memberEnrollment.id : null;
  const totalLessons = course.modules.reduce(
    (sum, m) => sum + m._count.lessons,
    0
  );
  const estimatedMinutes = Math.max(10, totalLessons * 8);
  const displayMinutes = course.durationMinutes || estimatedMinutes;
  const previewLessons = course.modules.flatMap((mod) =>
    mod.lessons
      .filter((lesson) => lesson.isPreview)
      .map((lesson) => ({ ...lesson, moduleTitle: mod.title }))
  );
  const descriptionParagraphs = (course.description ?? "")
    .split(/\n{2,}/)
    .map((text) => text.trim())
    .filter(Boolean);
  const coursePrice = course.isFree ? 0 : course.price;
  const adCurrencyCode = await getWorkspaceAdCurrency(workspace.id);
  const courseMetaData: MetaCustomData = {
    content_ids: [course.id],
    content_name: course.title,
    content_type: "course",
    content_category: MEMBERSHIP_LEVEL_LABEL[course.requiredLevel],
    contents: [{ id: course.id, quantity: 1, item_price: coursePrice }],
    currency: adCurrencyCode,
    value: coursePrice,
  };
  const metaAuthorization = issueMetaEventAuthorization({
    workspaceId: workspace.id,
    eventName: "ViewContent",
    customData: courseMetaData,
  });
  const averageRating = course.reviews.length ? course.reviews.reduce((sum, item) => sum + item.rating, 0) / course.reviews.length : null;
  const courseJsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    description: course.metaDescription || course.summary || course.description || undefined,
    provider: { "@type": "Organization", name: workspace.name },
    courseMode: "online",
    timeRequired: `PT${displayMinutes}M`,
    educationalLevel: course.difficulty.toLowerCase(),
    offers: { "@type": "Offer", price: coursePrice, priceCurrency: adCurrencyCode, availability: "https://schema.org/InStock" },
    ...(averageRating ? { aggregateRating: { "@type": "AggregateRating", ratingValue: averageRating.toFixed(1), reviewCount: course.reviews.length } } : {}),
  };

  return (
    <div className="min-h-screen bg-white text-zinc-950">
      <StoreHeader
        workspaceSlug={workspace.slug}
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        logoUrl={workspace.logoUrl}
      />
      <MetaEventTracker
        workspaceId={workspace.id}
        eventName="ViewContent"
        eventId={metaAuthorization.eventId}
        serverToken={metaAuthorization.token}
        dedupeKey={`course:${course.id}`}
        customData={courseMetaData}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(courseJsonLd).replace(/</g, "\\u003c") }} />

      <main>
        <section className="border-b border-zinc-200 bg-zinc-50">
          <div className="mx-auto max-w-6xl px-6 py-8">
            <Link
              href={publicSiteContextHref(workspace.slug, "courses")}
              className="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              All courses
            </Link>

            <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={course.isFree ? "success" : "default"}>
                    {course.isFree ? "Free" : formatPrice(course.price)}
                  </Badge>
                  {course.category ? <Badge variant="outline">{course.category.name}</Badge> : null}
                  <Badge variant="secondary">{course.difficulty.toLowerCase()}</Badge>
                <Badge variant="outline">
                  {totalLessons} lesson{totalLessons === 1 ? "" : "s"}
                </Badge>
                {previewLessons.length > 0 ? (
                  <Badge variant="secondary">
                    <Eye className="mr-1 h-3 w-3" />
                    {previewLessons.length} preview
                  </Badge>
                ) : null}
                  {course.requiredLevel !== "FREE" ? (
                    <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
                      <LockKeyhole className="mr-1 h-3 w-3" />
                      {MEMBERSHIP_LEVEL_LABEL[course.requiredLevel]} members only
                    </Badge>
                  ) : null}
                </div>
                <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-zinc-950">
                  {course.title}
                </h1>
                {course.summary ? (
                  <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-600">
                    {course.summary}
                  </p>
                ) : null}
                <div className="mt-6 grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-4">
                  <HeroStat
                    icon={Layers}
                    label="Modules"
                    value={course.modules.length}
                  />
                  <HeroStat icon={BookOpen} label="Lessons" value={totalLessons} />
                  <HeroStat icon={Clock3} label="Minutes" value={displayMinutes} />
                  <HeroStat
                    icon={Users}
                    label="Enrolled"
                    value={course._count.enrollments}
                  />
                </div>
              </div>

              {course.image ? (
                <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    loading="lazy"
                    decoding="async"
                    src={course.image.url}
                    alt=""
                    className="aspect-[16/10] w-full object-cover"
                  />
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-8">
            {descriptionParagraphs.length > 0 ? (
              <section>
                <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                  About this course
                </h2>
                <div className="mt-3 space-y-3 text-sm leading-7 text-zinc-600">
                  {descriptionParagraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ) : null}

            {course.instructorName ? (
              <section className="border-y border-zinc-200 py-5">
                <p className="text-xs font-medium uppercase text-zinc-500">Instructor</p>
                <h2 className="mt-1 text-lg font-semibold text-zinc-950">{course.instructorName}</h2>
                {course.instructorBio ? <p className="mt-2 max-w-2xl text-sm leading-7 text-zinc-600">{course.instructorBio}</p> : null}
              </section>
            ) : null}

            {previewLessons.length > 0 ? (
              <section>
                <div className="mb-4 flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                      Free preview lessons
                    </h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      Try a few lessons before enrolling.
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  {previewLessons.slice(0, 3).map((lesson) => (
                    <details
                      key={lesson.id}
                      className="group rounded-xl border border-zinc-200 bg-white"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                            <PlayCircle className="h-4 w-4 text-zinc-400" />
                            <span className="truncate">{lesson.title}</span>
                          </span>
                          <span className="mt-1 block text-xs text-zinc-500">
                            {lesson.moduleTitle}
                          </span>
                        </span>
                        <Badge variant="success">Preview</Badge>
                      </summary>
                      <div className="border-t border-zinc-100 px-4 py-4">
                        <LessonContent
                          type={lesson.type}
                          rawContent={lesson.content}
                        />
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                    {content.curriculumHeading}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Preview the learning path before enrolling.
                  </p>
                </div>
              </div>
              {course.modules.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
                  The instructor hasn&apos;t added any modules yet.
                </p>
              ) : (
                <ol className="space-y-2">
                  {course.modules.map((mod, i) => (
                    <li
                      key={mod.id}
                      className="rounded-xl border border-zinc-200 bg-white px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-xs font-semibold text-zinc-600">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-zinc-900">
                            {mod.title}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {mod._count.lessons} lesson
                            {mod._count.lessons === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>
                      {mod.lessons.length > 0 ? (
                        <ol className="mt-3 space-y-1 border-t border-zinc-100 pt-3">
                          {mod.lessons.slice(0, 5).map((lesson) => (
                            <li
                              key={lesson.id}
                              className="flex items-center gap-2 text-xs text-zinc-500"
                            >
                              <PlayCircle className="h-3.5 w-3.5 text-zinc-300" />
                              <span className="truncate">{lesson.title}</span>
                              {lesson.isPreview ? (
                                <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                                  Preview
                                </span>
                              ) : lesson.dripDays != null ? (
                                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                                  <CalendarClock className="h-3 w-3" />
                                  Day {lesson.dripDays}
                                </span>
                              ) : null}
                            </li>
                          ))}
                          {mod.lessons.length > 5 ? (
                            <li className="text-xs text-zinc-400">
                              + {mod.lessons.length - 5} more lessons
                            </li>
                          ) : null}
                        </ol>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {course.reviews.length > 0 ? (
              <section>
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                  <h2 className="text-lg font-semibold text-zinc-950">{averageRating?.toFixed(1)} from {course.reviews.length} review{course.reviews.length === 1 ? "" : "s"}</h2>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {course.reviews.map((review) => (
                    <article key={review.id} className="rounded-lg border border-zinc-200 p-4">
                      <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{review.customer.name}</p><span className="text-xs text-amber-600">{review.rating}/5</span></div>
                      {review.title ? <h3 className="mt-2 text-sm font-semibold">{review.title}</h3> : null}
                      {review.body ? <p className="mt-1 text-sm leading-6 text-zinc-600">{review.body}</p> : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <Card className="h-fit lg:sticky lg:top-6">
            <CardContent className="space-y-4 p-5">
              {enrollmentId ? (
                <>
                  <div className="flex items-center gap-2 text-emerald-700">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="text-sm font-medium">
                      You&apos;re enrolled
                    </span>
                  </div>
                  <p className="text-sm text-zinc-500">
                    Pick up where you left off.
                  </p>
                  <Button asChild className="w-full">
                    <Link href={`/learn/${enrollmentId}`}>
                      Continue learning <ArrowRight />
                    </Link>
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5 text-zinc-500" />
                    <p className="text-sm font-medium text-zinc-900">
                      {course.isFree
                        ? content.enrollFreeLabel
                        : `${content.enrollPaidLabel} · ${formatPrice(course.price)}`}
                    </p>
                  </div>
                  <p className="text-xs text-zinc-500">
                    {course.requiredLevel !== "FREE"
                      ? `Requires an active ${MEMBERSHIP_LEVEL_LABEL[course.requiredLevel]} membership before enrollment.`
                      : course.isFree
                        ? "Sign in with your email to start learning."
                        : "Complete checkout to unlock the course."}
                  </p>
                  {course.requiredLevel !== "FREE" ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      <div className="flex items-center gap-2 font-medium">
                        <LockKeyhole className="h-4 w-4" />
                        Membership access
                      </div>
                      {membershipPlans.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {membershipPlans.slice(0, 2).map((plan) => (
                            <div
                              key={plan.id}
                              className="rounded-lg bg-white px-3 py-2 text-zinc-700"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-medium text-zinc-900">
                                  {plan.name}
                                </span>
                                <span className="shrink-0 text-zinc-500">
                                  {plan.price === 0
                                    ? "Free"
                                    : formatPrice(plan.price)}
                                </span>
                              </div>
                              {plan.description ? (
                                <p className="mt-1 line-clamp-2 text-zinc-500">
                                  {plan.description}
                                </p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 leading-5">
                          No matching membership plan is currently public.
                          Contact the team for access.
                        </p>
                      )}
                      <Button asChild variant="outline" className="mt-3 w-full bg-white">
                        <Link
                          href={publicSiteContextHref(
                            workspace.slug,
                            "memberships"
                          )}
                        >
                          View memberships
                        </Link>
                      </Button>
                    </div>
                  ) : null}
                  {member ? (
                    <EnrollmentForm
                      workspaceId={workspace.id}
                      workspaceSlug={workspace.slug}
                      courseSlug={course.slug}
                      member={member}
                      manualPaymentMethods={manualPaymentMethods}
                      paid={!course.isFree && course.price > 0}
                      submitLabel={
                        course.isFree
                          ? content.enrollFreeLabel
                          : content.enrollPaidLabel
                      }
                    />
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Button asChild variant="outline">
                        <Link
                          href={publicSiteContextHref(
                            workspace.slug,
                            `member/login?callbackUrl=${encodeURIComponent(
                              publicSiteContextHref(
                                workspace.slug,
                                `courses/${course.slug}`
                              )
                            )}`
                          )}
                        >
                          Log in
                        </Link>
                      </Button>
                      <Button asChild>
                        <Link
                          href={publicSiteContextHref(
                            workspace.slug,
                            `member/register?callbackUrl=${encodeURIComponent(
                              publicSiteContextHref(
                                workspace.slug,
                                `courses/${course.slug}`
                              )
                            )}`
                          )}
                        >
                          Sign up
                        </Link>
                      </Button>
                    </div>
                  )}
                </>
              )}
              <div className="border-t border-zinc-100 pt-3 text-xs text-zinc-400">
                <Layers className="mr-1.5 inline h-3.5 w-3.5 -translate-y-px" />
                {course.modules.length} module
                {course.modules.length === 1 ? "" : "s"} · {totalLessons}{" "}
                lesson{totalLessons === 1 ? "" : "s"}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function HeroStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <Icon className="mb-2 h-4 w-4 text-zinc-400" />
      <p className="text-xl font-semibold text-zinc-950">{value}</p>
      <p className="text-[11px] text-zinc-500">{label}</p>
    </div>
  );
}
