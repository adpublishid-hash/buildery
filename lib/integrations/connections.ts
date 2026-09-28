import "server-only";

import type { IntegrationCategory, IntegrationConnection, IntegrationStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { secretHint } from "@/lib/secret-fields";

import { decryptSecrets, encryptSecrets, newWebhookKey } from "./crypto";
import { getProvider, secretFieldKeys, validateProviderInput, type FieldErrors, type ProviderDefinition } from "./registry";

/** A connection with its secrets decrypted. Server-only; never pass to the client. */
export type LoadedConnection = {
  id: string;
  workspaceId: string;
  provider: ProviderDefinition;
  enabled: boolean;
  isPrimary: boolean;
  config: Record<string, string>;
  secrets: Record<string, string>;
  webhookKey: string;
  status: IntegrationStatus;
};

/** What the settings UI may see: secrets reduced to "stored or not". */
export type ConnectionView = {
  id: string;
  providerId: string;
  enabled: boolean;
  isPrimary: boolean;
  status: IntegrationStatus;
  lastTestedAt: string | null;
  lastError: string | null;
  lastEventAt: string | null;
  config: Record<string, string>;
  secretHints: Record<string, string | null>;
  webhookUrl: string | null;
};

export function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/** Where a provider must deliver its webhooks for one connection. */
export function webhookUrlFor(providerId: string, webhookKey: string) {
  return `${appBaseUrl()}/api/integrations/webhooks/${providerId}/${webhookKey}`;
}

function configOf(row: IntegrationConnection): Record<string, string> {
  const raw = row.config;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function load(row: IntegrationConnection): LoadedConnection | null {
  const provider = getProvider(row.provider);
  if (!provider) return null;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    provider,
    enabled: row.enabled,
    isPrimary: row.isPrimary,
    config: configOf(row),
    secrets: decryptSecrets(row.secrets),
    webhookKey: row.webhookKey,
    status: row.status,
  };
}

export async function getConnection(workspaceId: string, providerId: string) {
  const row = await prisma.integrationConnection.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: providerId } },
  });
  return row ? load(row) : null;
}

/**
 * The provider to use for a category: the enabled primary, else the most
 * recently updated enabled one. Null when nothing in the category is on.
 */
export async function getActiveConnection(workspaceId: string, category: IntegrationCategory) {
  const row = await prisma.integrationConnection.findFirst({
    where: { workspaceId, category, enabled: true },
    orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
  });
  return row ? load(row) : null;
}

/** Every enabled connection in a category (e.g. all couriers that quote rates). */
export async function getEnabledConnections(workspaceId: string, category: IntegrationCategory) {
  const rows = await prisma.integrationConnection.findMany({
    where: { workspaceId, category, enabled: true },
    orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
  });
  return rows.map(load).filter((row): row is LoadedConnection => row !== null);
}

/** Resolves an inbound webhook to its connection. The key is the only proof of origin until the provider's own signature is checked. */
export async function getConnectionByWebhookKey(providerId: string, webhookKey: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(webhookKey)) return null;
  const row = await prisma.integrationConnection.findUnique({ where: { webhookKey } });
  if (!row || row.provider !== providerId) return null;
  return load(row);
}

export async function listConnectionViews(workspaceId: string): Promise<ConnectionView[]> {
  const rows = await prisma.integrationConnection.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
  return rows.flatMap((row) => {
    const loaded = load(row);
    if (!loaded) return [];
    return [
      {
        id: row.id,
        providerId: row.provider,
        enabled: row.enabled,
        isPrimary: row.isPrimary,
        status: row.status,
        lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
        lastError: row.lastError,
        lastEventAt: row.lastEventAt?.toISOString() ?? null,
        config: loaded.config,
        secretHints: Object.fromEntries(secretFieldKeys(loaded.provider).map((key) => [key, secretHint(loaded.secrets[key])])),
        webhookUrl: loaded.provider.webhook ? webhookUrlFor(row.provider, row.webhookKey) : null,
      },
    ];
  });
}

/**
 * Creates or updates a connection. Blank secret fields keep the stored value;
 * `clearSecrets` removes them. Credentials changing resets the tested status.
 */
export async function saveConnection(input: {
  workspaceId: string;
  providerId: string;
  values: Record<string, unknown>;
  clearSecrets?: string[];
  enabled?: boolean;
}): Promise<{ ok: true; connection: LoadedConnection } | { ok: false; error: string; fieldErrors?: FieldErrors }> {
  const provider = getProvider(input.providerId);
  if (!provider) return { ok: false, error: "Unknown provider." };

  const existing = await prisma.integrationConnection.findUnique({
    where: { workspaceId_provider: { workspaceId: input.workspaceId, provider: provider.id } },
  });
  const stored = existing ? decryptSecrets(existing.secrets) : {};
  for (const key of input.clearSecrets ?? []) delete stored[key];

  const parsed = validateProviderInput(provider, input.values, new Set(Object.keys(stored)));
  if (!parsed.ok) return { ok: false, error: "Please check the highlighted fields.", fieldErrors: parsed.errors };

  const secrets = { ...stored, ...parsed.secrets };
  // Drop anything the provider no longer declares.
  const allowed = new Set(secretFieldKeys(provider));
  for (const key of Object.keys(secrets)) if (!allowed.has(key)) delete secrets[key];

  const credentialsChanged =
    !existing ||
    Object.keys(parsed.secrets).length > 0 ||
    (input.clearSecrets?.length ?? 0) > 0 ||
    JSON.stringify(configOf(existing)) !== JSON.stringify(parsed.config);

  const data = {
    config: parsed.config as Prisma.InputJsonValue,
    secrets: encryptSecrets(secrets),
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(credentialsChanged ? { status: "UNTESTED" as const, lastError: null } : {}),
  };

  const row = existing
    ? await prisma.integrationConnection.update({ where: { id: existing.id }, data })
    : await prisma.integrationConnection.create({
        data: {
          workspaceId: input.workspaceId,
          category: provider.category,
          provider: provider.id,
          webhookKey: newWebhookKey(),
          enabled: input.enabled ?? true,
          // The first provider in a category becomes its default.
          isPrimary:
            (await prisma.integrationConnection.count({
              where: { workspaceId: input.workspaceId, category: provider.category },
            })) === 0,
          ...data,
        },
      });
  return { ok: true, connection: load(row)! };
}

/** Makes one connection the category default; the others stop being primary. */
export async function setPrimaryConnection(workspaceId: string, connectionId: string) {
  const row = await prisma.integrationConnection.findFirst({ where: { id: connectionId, workspaceId } });
  if (!row) return false;
  await prisma.$transaction([
    prisma.integrationConnection.updateMany({
      where: { workspaceId, category: row.category, NOT: { id: row.id } },
      data: { isPrimary: false },
    }),
    prisma.integrationConnection.update({ where: { id: row.id }, data: { isPrimary: true, enabled: true } }),
  ]);
  return true;
}

export async function recordTestResult(connectionId: string, result: { ok: true } | { ok: false; error: string }) {
  await prisma.integrationConnection.update({
    where: { id: connectionId },
    data: {
      status: result.ok ? "CONNECTED" : "ERROR",
      lastTestedAt: new Date(),
      lastError: result.ok ? null : result.error.slice(0, 1000),
    },
  });
}

/** Notes that a webhook arrived, and records a provider-side failure when there is one. */
export async function recordInboundEvent(connectionId: string, error?: string) {
  await prisma.integrationConnection.update({
    where: { id: connectionId },
    data: error ? { lastEventAt: new Date(), lastError: error.slice(0, 1000) } : { lastEventAt: new Date() },
  });
}
