import "server-only";

import type { AdProvider } from "@/lib/ad-event-queue";
import { sendAppEmail } from "@/lib/app-email";
import { prisma } from "@/lib/prisma";
import { sendWorkspaceTelegramMessage } from "@/lib/telegram";

const PROVIDER_LABEL: Record<AdProvider, string> = {
  META: "Meta Conversions API",
  TIKTOK: "TikTok Events API",
  GA4: "GA4 Measurement Protocol",
};

/**
 * Tells the store owner their ad platform rejected the access token.
 *
 * It is the one delivery failure only a person can fix, and until someone does
 * every server event for that platform is lost. It used to show only on the
 * integrations page, which nobody opens while things look fine.
 *
 * Once a day per provider: the daily stat row is claimed atomically, so
 * parallel flushes cannot send the same alert twice.
 */
export async function alertAdTokenRejected(input: {
  workspaceId: string;
  provider: AdProvider;
  day: Date;
  error: string;
}) {
  const claim = await prisma.metaCapiDailyStat.updateMany({
    where: {
      workspaceId: input.workspaceId,
      provider: input.provider,
      day: input.day,
      alertedAt: null,
    },
    data: { alertedAt: new Date() },
  });
  if (claim.count !== 1) return { sent: false as const, reason: "already_alerted" as const };

  const workspace = await prisma.workspace.findUnique({
    where: { id: input.workspaceId },
    select: {
      name: true,
      createdBy: { select: { email: true } },
      members: {
        where: { role: { in: ["OWNER", "ADMIN"] } },
        select: { user: { select: { email: true } } },
      },
    },
  });
  if (!workspace) return { sent: false as const, reason: "no_workspace" as const };

  const label = PROVIDER_LABEL[input.provider];
  const settingsUrl = absoluteAppUrl("/dashboard/settings/integrations");
  const subject = `Token ${label} ditolak · ${workspace.name}`;
  const text = [
    `${label} menolak access token untuk ${workspace.name}.`,
    "Selama token belum diganti, event iklan dari server ke platform ini tidak terkirim.",
    `Pesan dari platform: ${input.error.slice(0, 300)}`,
    `Perbarui token di: ${settingsUrl}`,
  ].join("\n\n");

  const recipients = Array.from(
    new Set(
      [workspace.createdBy?.email, ...workspace.members.map((m) => m.user.email)]
        .filter((email): email is string => Boolean(email))
        .map((email) => email.toLowerCase())
    )
  );

  const results = await Promise.allSettled([
    ...recipients.map((to) => sendAppEmail({ to, subject, text })),
    sendWorkspaceTelegramMessage(input.workspaceId, `⚠️ ${subject}\n\n${text}`),
  ]);
  return {
    sent: true as const,
    recipients: recipients.length,
    delivered: results.filter((r) => r.status === "fulfilled" && r.value.ok).length,
  };
}

function absoluteAppUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  return new URL(path, base).toString();
}
