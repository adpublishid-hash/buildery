import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { NextResponse, type NextRequest } from "next/server";

import { getMemberSession } from "@/lib/member-auth";
import { prisma } from "@/lib/prisma";
import { hasRequiredMembership } from "@/lib/membership";

export async function GET(req: NextRequest, { params }: { params: { assetId: string } }) {
  const enrollmentId = req.nextUrl.searchParams.get("enrollment");
  const member = await getMemberSession();
  if (!member || !enrollmentId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const enrollment = await prisma.enrollment.findFirst({
    where: {
      id: enrollmentId,
      customerId: member.customerId,
      workspaceId: member.workspaceId,
      status: { in: ["ACTIVE", "COMPLETED"] },
      OR: [{ accessExpiresAt: null }, { accessExpiresAt: { gt: new Date() } }],
    },
    select: {
      courseId: true,
      enrolledAt: true,
      customerId: true,
      workspaceId: true,
      course: { select: { requiredLevel: true } },
    },
  });
  if (!enrollment) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  if (!(await hasRequiredMembership(enrollment.workspaceId, enrollment.customerId, enrollment.course.requiredLevel))) {
    return NextResponse.json({ error: "Membership access has ended" }, { status: 403 });
  }
  const asset = await prisma.courseAsset.findFirst({
    where: { id: params.assetId, courseId: enrollment.courseId },
    include: { lessons: { select: { id: true, dripDays: true, prerequisiteLessonId: true } } },
  });
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  if (asset.lessons.length === 0 || !(await hasUnlockedLesson(asset.lessons, enrollmentId, enrollment.enrolledAt))) {
    return NextResponse.json({ error: "Asset is locked" }, { status: 403 });
  }
  const root = path.join(process.cwd(), "private", "course-assets");
  const absolute = path.resolve(root, asset.storageKey);
  if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`)) {
    return NextResponse.json({ error: "Invalid asset" }, { status: 400 });
  }
  try {
    const info = await stat(absolute);
    const inline = asset.kind === "VIDEO" || asset.kind === "PDF";
    const range = parseRange(req.headers.get("range"), info.size);
    if (range === "invalid") {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } });
    }
    const start = range?.start ?? 0;
    const end = range?.end ?? info.size - 1;
    const stream = Readable.toWeb(createReadStream(absolute, { start, end }));
    return new NextResponse(stream as ReadableStream, {
      status: range ? 206 : 200,
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(end - start + 1),
        "Accept-Ranges": "bytes",
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${info.size}` } : {}),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeFilename(asset.name)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Asset file is unavailable" }, { status: 404 });
  }
}

async function hasUnlockedLesson(
  lessons: Array<{ id: string; dripDays: number | null; prerequisiteLessonId: string | null }>,
  enrollmentId: string,
  enrolledAt: Date
) {
  const prerequisiteIds = lessons.flatMap((lesson) => lesson.prerequisiteLessonId ? [lesson.prerequisiteLessonId] : []);
  const completed = prerequisiteIds.length
    ? await prisma.lessonProgress.findMany({
        where: { enrollmentId, lessonId: { in: prerequisiteIds }, completedAt: { not: null } },
        select: { lessonId: true },
      })
    : [];
  const completedIds = new Set(completed.map((item) => item.lessonId));
  return lessons.some((lesson) => {
    const unlockAt = new Date(enrolledAt);
    unlockAt.setDate(unlockAt.getDate() + (lesson.dripDays ?? 0));
    return unlockAt <= new Date() && (!lesson.prerequisiteLessonId || completedIds.has(lesson.prerequisiteLessonId));
  });
}

function parseRange(value: string | null, size: number): { start: number; end: number } | "invalid" | null {
  if (!value) return null;
  const match = /^bytes=(\d+)-(\d*)$/.exec(value.trim());
  if (!match) return "invalid";
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= size || requestedEnd < start) {
    return "invalid";
  }
  return { start, end: Math.min(requestedEnd, size - 1) };
}

function safeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180);
}
