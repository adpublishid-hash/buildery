import "server-only";

import { cookies } from "next/headers";
import type { LessonType } from "@prisma/client";

export const ENROLLMENT_COOKIE = "bd_enrollments";

export type EnrollmentMap = Record<string, string>; // courseId -> enrollmentId

/** Reads the enrollment cookie, always returns a sane shape. */
export function readEnrollments(): EnrollmentMap {
  const raw = cookies().get(ENROLLMENT_COOKIE)?.value;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: EnrollmentMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Returns the cached enrollment id for a course, if any. */
export function getEnrollmentId(courseId: string): string | null {
  return readEnrollments()[courseId] ?? null;
}

/** Cookie writer used by the enrollment action. */
export function writeEnrollments(map: EnrollmentMap) {
  cookies().set(ENROLLMENT_COOKIE, JSON.stringify(map), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
}

// ----- Lesson content shapes (mirrors the Zod schemas) -----

export type TextLesson = { body: string };
export type VideoEmbedLesson = { url: string };
export type PdfLesson = { url: string };
export type LinkLesson = { url: string; label: string };

export type LessonContent =
  | TextLesson
  | VideoEmbedLesson
  | PdfLesson
  | LinkLesson;

const DEFAULT_CONTENT: Record<LessonType, LessonContent> = {
  TEXT: { body: "" },
  VIDEO_EMBED: { url: "" },
  PDF: { url: "" },
  LINK: { url: "", label: "Open link" },
};

/** Safely parses persisted lesson content; falls back to defaults. */
export function parseLessonContent(
  type: LessonType,
  data: unknown
): LessonContent {
  if (!data || typeof data !== "object") return DEFAULT_CONTENT[type];
  const d = data as Record<string, unknown>;
  switch (type) {
    case "TEXT":
      return { body: typeof d.body === "string" ? d.body : "" };
    case "VIDEO_EMBED":
    case "PDF":
      return { url: typeof d.url === "string" ? d.url : "" };
    case "LINK":
      return {
        url: typeof d.url === "string" ? d.url : "",
        label: typeof d.label === "string" && d.label ? d.label : "Open link",
      };
  }
}

/**
 * Turns a YouTube/Vimeo watch URL into an embeddable one. If the URL is
 * already an embed URL or from an unknown host, returns it unchanged.
 */
export function normalizeEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");

    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
  } catch {
    // not a valid URL — let the renderer decide what to show
  }
  return url;
}
