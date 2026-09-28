import "server-only";

import type { EnrollmentStatus, Prisma } from "@prisma/client";

export const ENROLLMENT_STATUSES: EnrollmentStatus[] = ["ACTIVE", "COMPLETED", "PENDING", "CANCELLED"];

export type StudentFilters = { courseId: string; status: EnrollmentStatus | "ALL"; q: string };

export function parseStudentFilters(params: { course?: string | null; status?: string | null; q?: string | null }): StudentFilters {
  const status = ENROLLMENT_STATUSES.find((item) => item === params.status) ?? "ALL";
  return {
    courseId: (params.course ?? "").slice(0, 40),
    status,
    q: (params.q ?? "").trim().slice(0, 100),
  };
}

/** Enrollments across every course in the workspace, narrowed by the filters. */
export function studentWhere(workspaceId: string, filters: StudentFilters): Prisma.EnrollmentWhereInput {
  return {
    workspaceId,
    ...(filters.courseId ? { courseId: filters.courseId } : {}),
    ...(filters.status !== "ALL" ? { status: filters.status } : {}),
    ...(filters.q
      ? {
          customer: {
            OR: [
              { name: { contains: filters.q, mode: "insensitive" } },
              { email: { contains: filters.q, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };
}
