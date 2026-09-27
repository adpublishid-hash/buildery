import "server-only";

import type { Prisma, PrismaClient, ScheduledJobKind } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient | PrismaClient;

export type EnqueueInput = {
  kind: ScheduledJobKind;
  workspaceId?: string | null;
  runAt?: Date;
  payload?: Prisma.InputJsonValue;
  dedupeKey?: string | null;
  excludeJobId?: string | null;
  maxAttempts?: number;
};

export async function enqueueJob(input: EnqueueInput, tx: Tx = prisma) {
  if (input.dedupeKey) {
    const existing = await tx.scheduledJob.findFirst({
      where: {
        dedupeKey: input.dedupeKey,
        status: { in: ["PENDING", "RUNNING"] },
        ...(input.excludeJobId ? { id: { not: input.excludeJobId } } : {}),
      },
      select: { id: true },
    });
    if (existing) return null;
  }

  return tx.scheduledJob.create({
    data: {
      kind: input.kind,
      workspaceId: input.workspaceId ?? null,
      runAt: input.runAt ?? new Date(),
      payload: input.payload ?? {},
      dedupeKey: input.dedupeKey ?? null,
      maxAttempts: input.maxAttempts ?? 3,
    },
  });
}

export async function pruneFinishedJobs(olderThanDays = 14) {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const result = await prisma.scheduledJob.deleteMany({
    where: {
      status: { in: ["DONE", "CANCELED"] },
      finishedAt: { lt: cutoff },
    },
  });
  return result.count;
}
