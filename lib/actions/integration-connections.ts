"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { recordSettingsAudit } from "@/lib/settings-audit";
import { getCurrentWorkspace } from "@/lib/workspace";
import {
  getConnection,
  recordTestResult,
  saveConnection,
  setPrimaryConnection,
} from "@/lib/integrations/connections";
import { newWebhookKey } from "@/lib/integrations/crypto";
import { getProvider, secretFieldKeys, type FieldErrors } from "@/lib/integrations/registry";
import { testConnection } from "@/lib/integrations/test-connection";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; fieldErrors?: FieldErrors };

/** Same permission as the rest of the integrations page: these are store credentials. */
async function authorize() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "branding.edit")) return null;
  return { userId: session.user.id, email: session.user.email ?? "", workspaceId: current.workspace.id };
}

function refresh() {
  revalidatePath("/dashboard/settings/integrations");
}

export async function saveIntegrationConnectionAction(input: {
  providerId: string;
  values: Record<string, string>;
  clearSecrets?: string[];
  enabled?: boolean;
}): Promise<Result<{ connectionId: string }>> {
  const ctx = await authorize();
  if (!ctx) return { ok: false, error: "Not allowed." };
  const provider = getProvider(input.providerId);
  if (!provider) return { ok: false, error: "Unknown provider." };
  const before = await getConnection(ctx.workspaceId, provider.id);
  const values = Object.fromEntries(
    Object.entries(input.values ?? {}).filter(([key]) => provider.fields.some((field) => field.key === key))
  );
  const clearSecrets = (input.clearSecrets ?? []).filter((key) => secretFieldKeys(provider).includes(key));
  const saved = await saveConnection({
    workspaceId: ctx.workspaceId,
    providerId: provider.id,
    values,
    clearSecrets,
    enabled: input.enabled,
  });
  if (!saved.ok) return saved;

  // Field names only; secret values never reach the audit log.
  const touchedSecrets = secretFieldKeys(provider).filter((key) => values[key]?.trim() || clearSecrets.includes(key));
  await recordSettingsAudit(prisma, {
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: before ? "settings.integration.updated" : "settings.integration.connected",
    changedFields: [
      ...Object.keys(saved.connection.config).filter((key) => before?.config[key] !== saved.connection.config[key]),
      ...touchedSecrets.map((key) => `${provider.id}.${key}`),
    ],
    summary: `${before ? "Updated" : "Connected"} ${provider.name}.`,
    targetType: "integration",
    targetId: saved.connection.id,
  });
  refresh();
  return { ok: true, data: { connectionId: saved.connection.id } };
}

export async function setIntegrationEnabledAction(connectionId: string, enabled: boolean): Promise<Result> {
  const ctx = await authorize();
  if (!ctx) return { ok: false, error: "Not allowed." };
  const updated = await prisma.integrationConnection.updateMany({
    where: { id: connectionId, workspaceId: ctx.workspaceId },
    data: { enabled: Boolean(enabled) },
  });
  if (!updated.count) return { ok: false, error: "Integration not found." };
  refresh();
  return { ok: true };
}

export async function setPrimaryIntegrationAction(connectionId: string): Promise<Result> {
  const ctx = await authorize();
  if (!ctx) return { ok: false, error: "Not allowed." };
  if (!(await setPrimaryConnection(ctx.workspaceId, connectionId))) return { ok: false, error: "Integration not found." };
  refresh();
  return { ok: true };
}

export async function testIntegrationConnectionAction(connectionId: string): Promise<Result<{ detail?: string }>> {
  const ctx = await authorize();
  if (!ctx) return { ok: false, error: "Not allowed." };
  const row = await prisma.integrationConnection.findFirst({
    where: { id: connectionId, workspaceId: ctx.workspaceId },
    select: { provider: true },
  });
  const connection = row ? await getConnection(ctx.workspaceId, row.provider) : null;
  if (!connection) return { ok: false, error: "Integration not found." };
  const result = await testConnection(connection, { operatorEmail: ctx.email });
  await recordTestResult(connection.id, result);
  refresh();
  return result.ok ? { ok: true, data: { detail: result.detail } } : { ok: false, error: result.error };
}

/** Removes the connection and its stored credentials. */
export async function deleteIntegrationConnectionAction(connectionId: string): Promise<Result> {
  const ctx = await authorize();
  if (!ctx) return { ok: false, error: "Not allowed." };
  const row = await prisma.integrationConnection.findFirst({ where: { id: connectionId, workspaceId: ctx.workspaceId } });
  if (!row) return { ok: false, error: "Integration not found." };
  await prisma.integrationConnection.delete({ where: { id: row.id } });
  // Keep a default in the category if another provider is still connected.
  if (row.isPrimary) {
    const next = await prisma.integrationConnection.findFirst({
      where: { workspaceId: ctx.workspaceId, category: row.category },
      orderBy: { updatedAt: "desc" },
    });
    if (next) await prisma.integrationConnection.update({ where: { id: next.id }, data: { isPrimary: true } });
  }
  await recordSettingsAudit(prisma, {
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: "settings.integration.disconnected",
    changedFields: [`${row.provider}.credentials`],
    summary: `Disconnected ${getProvider(row.provider)?.name ?? row.provider}.`,
    targetType: "integration",
    targetId: row.id,
  });
  refresh();
  return { ok: true };
}

/** Issues a new webhook URL; the old one stops working immediately. */
export async function rotateIntegrationWebhookAction(connectionId: string): Promise<Result> {
  const ctx = await authorize();
  if (!ctx) return { ok: false, error: "Not allowed." };
  const updated = await prisma.integrationConnection.updateMany({
    where: { id: connectionId, workspaceId: ctx.workspaceId },
    data: { webhookKey: newWebhookKey() },
  });
  if (!updated.count) return { ok: false, error: "Integration not found." };
  refresh();
  return { ok: true };
}
