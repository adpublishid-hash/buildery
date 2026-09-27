import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { CourseStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { EditorStatus } from "@/components/dashboard/editor-shell";
import { CourseSubNav } from "@/components/courses/course-sub-nav";

const STATUS_LABEL: Record<CourseStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Terbit",
  ARCHIVED: "Arsip",
};

export default async function CourseEditLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { courseId: string };
}) {
  const { workspace } = await requireCurrentWorkspace();
  const course = await prisma.course.findUnique({
    where: { id: params.courseId },
    select: { id: true, title: true, status: true, workspaceId: true },
  });
  if (!course || course.workspaceId !== workspace.id) notFound();

  const tone = course.status === "PUBLISHED" ? "live" : course.status === "ARCHIVED" ? "archived" : "draft";

  return (
    <div className="w-full min-w-0">
      <div className="flex min-w-0 items-center gap-[10px] pb-[10px]">
        <Link
          href="/dashboard/courses"
          aria-label="Kembali ke kursus"
          title="Kembali ke kursus"
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] border-[0.8px] border-kv-border text-kv-secondary-fg transition-colors hover:bg-kv-hover hover:text-kv-fg"
        >
          <ArrowLeft className="h-[15px] w-[15px]" />
        </Link>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.06em] text-kv-muted-fg">Kursus</p>
          <div className="mt-[2px] flex min-w-0 items-center gap-[8px]">
            <h1 className="truncate text-[17px] font-semibold leading-tight tracking-[-0.01em] text-kv-fg">{course.title}</h1>
            <EditorStatus tone={tone}>{STATUS_LABEL[course.status]}</EditorStatus>
          </div>
        </div>
      </div>

      <CourseSubNav courseId={course.id} />

      <div className="pt-[12px]">{children}</div>
    </div>
  );
}
