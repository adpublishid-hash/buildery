import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowRight,
  BookOpen,
  GraduationCap,
  Layers,
  LockKeyhole,
  Package,
  Sparkles,
  Users,
  Search,
  Star,
} from "lucide-react";

import { publicSiteContextHref } from "@/lib/public-url-server";
import { prisma } from "@/lib/prisma";
import { getStoreWorkspace, formatPrice } from "@/lib/store";
import { resolveLmsCatalog } from "@/lib/lms-catalog";
import { Badge } from "@/components/ui/badge";
import { StoreHeader } from "@/components/store/store-header";
import { MEMBERSHIP_LEVEL_LABEL } from "@/lib/labels";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pagination, parsePage } from "@/components/ui/pagination";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { workspaceSlug: string };
}): Promise<Metadata> {
  const workspace = await getStoreWorkspace(params.workspaceSlug);
  if (!workspace) return { title: "Store not found" };
  return { title: { absolute: `Courses · ${workspace.name}` } };
}

export default async function PublicCoursesPage({
  params,
  searchParams,
}: {
  params: { workspaceSlug: string };
  searchParams: { q?: string; category?: string; difficulty?: string; pricing?: string; page?: string };
}) {
  const workspace = await getStoreWorkspace(params.workspaceSlug);
  if (!workspace) notFound();

  const lmsSetting = await prisma.lmsSetting.findUnique({
    where: { workspaceId: workspace.id },
  });
  const catalog = resolveLmsCatalog(lmsSetting);

  const page = parsePage(searchParams.page);
  const pageSize = 12;
  const q = (searchParams.q ?? "").trim();
  const difficulty = ["BEGINNER", "INTERMEDIATE", "ADVANCED"].includes(searchParams.difficulty ?? "") ? searchParams.difficulty : "";
  const where = {
    workspaceId: workspace.id,
    status: "PUBLISHED" as const,
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { summary: { contains: q, mode: "insensitive" as const } }, { tags: { has: q.toLowerCase() } }] } : {}),
    ...(searchParams.category ? { category: { slug: searchParams.category } } : {}),
    ...(difficulty ? { difficulty: difficulty as "BEGINNER" | "INTERMEDIATE" | "ADVANCED" } : {}),
    ...(searchParams.pricing === "free" ? { isFree: true } : searchParams.pricing === "paid" ? { isFree: false } : {}),
  };
  const [courses, total, categories] = await Promise.all([
    prisma.course.findMany({
      where,
      include: {
        image: true,
        category: { select: { name: true, slug: true } },
        reviews: { where: { status: "APPROVED" }, select: { rating: true } },
        _count: { select: { modules: true, enrollments: true } },
        modules: { select: { _count: { select: { lessons: true } } } },
      },
      orderBy: [{ featured: "desc" }, { publishedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.course.count({ where }),
    prisma.courseCategory.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: "asc" } }),
  ]);
  const totalLessons = courses.reduce(
    (sum, course) =>
      sum +
      course.modules.reduce(
        (lessonSum, mod) => lessonSum + mod._count.lessons,
        0
      ),
    0
  );
  const totalEnrollments = courses.reduce(
    (sum, course) => sum + course._count.enrollments,
    0
  );
  const featured = courses[0] ?? null;
  const rest = featured ? courses.slice(1) : courses;

  return (
    <div className="min-h-screen bg-white text-zinc-950">
      <StoreHeader
        workspaceSlug={workspace.slug}
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        logoUrl={workspace.logoUrl}
      />

      <main>
        <section className="border-b border-zinc-200 bg-zinc-50">
          <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                {workspace.name} {catalog.eyebrow}
              </div>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-zinc-950">
                {catalog.heading}
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-600">
                {catalog.subheading}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <CatalogStat
                icon={GraduationCap}
                value={total}
                label="Courses"
              />
              <CatalogStat icon={BookOpen} value={totalLessons} label="Lessons" />
              <CatalogStat icon={Users} value={totalEnrollments} label="Learners" />
            </div>
          </div>
        </section>

        <div className="border-b border-zinc-200 bg-white">
          <form className="mx-auto grid max-w-6xl gap-2 px-6 py-4 sm:grid-cols-[minmax(220px,1fr)_180px_160px_140px_auto]">
            <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><Input name="q" defaultValue={q} placeholder="Search courses" className="pl-9" /></div>
            <select name="category" defaultValue={searchParams.category ?? ""} className={filterClass}><option value="">All categories</option>{categories.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</select>
            <select name="difficulty" defaultValue={difficulty} className={filterClass}><option value="">All levels</option><option value="BEGINNER">Beginner</option><option value="INTERMEDIATE">Intermediate</option><option value="ADVANCED">Advanced</option></select>
            <select name="pricing" defaultValue={searchParams.pricing ?? ""} className={filterClass}><option value="">All pricing</option><option value="free">Free</option><option value="paid">Paid</option></select>
            <Button type="submit">Filter</Button>
          </form>
        </div>

        {courses.length === 0 ? (
          <div className="mx-auto flex max-w-5xl flex-col items-center justify-center px-6 py-20 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100">
              <GraduationCap className="h-6 w-6 text-zinc-400" />
            </div>
            <p className="text-sm font-medium text-zinc-900">
              No courses available
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Check back soon — new courses will appear here.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-6xl px-6 py-10">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                  Available courses
                </h2>
                <p className="text-sm text-zinc-500">
                  {total} matching courses
                </p>
              </div>
            </div>

            {featured ? (
              <Link
                href={publicSiteContextHref(
                  workspace.slug,
                  `courses/${featured.slug}`
                )}
                className="group mb-6 grid overflow-hidden rounded-xl border border-zinc-200 bg-white transition hover:border-zinc-300 hover:shadow-sm lg:grid-cols-[minmax(0,1fr)_380px]"
              >
                <CourseImage course={featured} featured />
                <CourseCardBody
                  course={featured}
                  featured
                  lessonCount={lessonCount(featured)}
                />
              </Link>
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((course) => (
                <Link
                  key={course.id}
                  href={publicSiteContextHref(
                    workspace.slug,
                    `courses/${course.slug}`
                  )}
                  className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition hover:border-zinc-300 hover:shadow-sm"
                >
                  <CourseImage course={course} />
                  <CourseCardBody course={course} lessonCount={lessonCount(course)} />
                </Link>
              ))}
            </div>
            <Pagination page={page} total={total} pageSize={pageSize} basePath={publicSiteContextHref(workspace.slug, "courses")} params={{ q: q || undefined, category: searchParams.category, difficulty: difficulty || undefined, pricing: searchParams.pricing }} />
          </div>
        )}
      </main>
    </div>
  );
}

type CourseCardData = {
  title: string;
  summary: string | null;
  price: number;
  isFree: boolean;
  requiredLevel: "FREE" | "BASIC" | "PREMIUM";
  image: { url: string } | null;
  _count: { modules: number; enrollments: number };
  modules: Array<{ _count: { lessons: number } }>;
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  durationMinutes: number;
  category: { name: string; slug: string } | null;
  reviews: Array<{ rating: number }>;
};

function lessonCount(course: CourseCardData) {
  return course.modules.reduce((sum, mod) => sum + mod._count.lessons, 0);
}

function CourseImage({
  course,
  featured,
}: {
  course: CourseCardData;
  featured?: boolean;
}) {
  return (
    <div
      className={
        featured
          ? "order-first aspect-[16/10] overflow-hidden bg-zinc-50 lg:order-last lg:aspect-auto"
          : "aspect-[16/10] overflow-hidden bg-zinc-50"
      }
    >
      {course.image ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          loading="lazy"
          decoding="async"
          src={course.image.url}
          alt=""
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Package className="h-8 w-8 text-zinc-300" />
        </div>
      )}
    </div>
  );
}

function CourseCardBody({
  course,
  lessonCount,
  featured,
}: {
  course: CourseCardData;
  lessonCount: number;
  featured?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant={course.isFree ? "success" : "default"}>
          {course.isFree ? "Free" : formatPrice(course.price)}
        </Badge>
        {course.requiredLevel !== "FREE" ? (
          <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
            <LockKeyhole className="mr-1 h-3 w-3" />
            {MEMBERSHIP_LEVEL_LABEL[course.requiredLevel]}
          </Badge>
        ) : null}
        {featured ? <Badge variant="outline">Featured</Badge> : null}
        <Badge variant="outline">{course.difficulty.toLowerCase()}</Badge>
      </div>
      <p
        className={
          featured
            ? "text-2xl font-semibold tracking-tight text-zinc-950"
            : "text-sm font-medium text-zinc-950"
        }
      >
        {course.title}
      </p>
      {course.summary ? (
        <p
          className={
            featured
              ? "mt-2 line-clamp-3 text-sm leading-6 text-zinc-600"
              : "mt-1 line-clamp-2 text-xs leading-5 text-zinc-500"
          }
        >
          {course.summary}
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center gap-3 pt-4 text-xs text-zinc-500">
        {course.reviews.length ? <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{(course.reviews.reduce((sum, item) => sum + item.rating, 0) / course.reviews.length).toFixed(1)}</span> : null}
        <span className="inline-flex items-center gap-1">
          <Layers className="h-3.5 w-3.5" />
          {course._count.modules} module{course._count.modules === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-1">
          <BookOpen className="h-3.5 w-3.5" />
          {lessonCount} lesson{lessonCount === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          {course._count.enrollments} enrolled
        </span>
        <span className="ml-auto inline-flex items-center gap-1 font-medium text-zinc-900">
          View course <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
}

const filterClass = "flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm";

function CatalogStat({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <Icon className="mb-3 h-4 w-4 text-zinc-400" />
      <p className="text-2xl font-semibold text-zinc-950">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{label}</p>
    </div>
  );
}
