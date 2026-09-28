import "server-only";

import { prisma } from "@/lib/prisma";

/** Assignment submissions waiting for an instructor, across every course. */
export function countSubmissionsToGrade(workspaceId: string) {
  return prisma.assignmentSubmission.count({
    where: {
      status: "SUBMITTED",
      assignment: { lesson: { module: { course: { workspaceId } } } },
    },
  });
}
