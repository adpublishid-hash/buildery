import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type AuditClient = PrismaClient | Prisma.TransactionClient;

export async function writePlatformAudit(input: {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue;
  client?: AuditClient;
}) {
  const client = input.client ?? prisma;
  return client.platformAuditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      summary: input.summary,
      metadata: input.metadata ?? {},
    },
  });
}
