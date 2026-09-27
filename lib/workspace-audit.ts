import "server-only";

import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type WorkspaceAuditInput = {
  workspaceId: string;
  actorId?: string | null;
  action: string;
  summary: string;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
};

export async function writeWorkspaceAudit(db: DbClient, input: WorkspaceAuditInput) {
  const salt = process.env.AUDIT_HASH_SALT || process.env.NEXTAUTH_SECRET || "buildery";
  const ipHash = input.ip
    ? createHash("sha256").update(`${salt}:${input.ip}`).digest("hex")
    : null;

  return db.workspaceAuditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.actorId ?? null,
      action: input.action,
      summary: input.summary,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata ?? {},
      ipHash,
      userAgent: input.userAgent?.slice(0, 500) ?? null,
    },
  });
}
