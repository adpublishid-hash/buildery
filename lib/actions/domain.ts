"use server";

import { promises as dns } from "node:dns";
import tls from "node:tls";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { normalizeDomain, isValidDomain, CUSTOM_DOMAIN_TARGET_IP } from "@/lib/domain";
import { PUBLIC_SITE_DOMAIN } from "@/lib/public-url";
import { writeWorkspaceAudit } from "@/lib/workspace-audit";

type DnsResult =
  | { ok: true; domain: string; targetIp: string; aRecords: string[]; cname: string | null; pointsHere: boolean; ownershipVerified: boolean; sslActive: boolean; sslExpiresAt: string | null; status: "ACTIVE" | "ERROR" }
  | { ok: false; error: string };

async function inspectTls(domain: string) {
  return new Promise<{ active: boolean; expiresAt: Date | null }>((resolve) => {
    const socket = tls.connect({ host: domain, port: 443, servername: domain, rejectUnauthorized: true, timeout: 5000 }, () => {
      const cert = socket.getPeerCertificate();
      const expiresAt = cert?.valid_to ? new Date(cert.valid_to) : null;
      socket.end();
      resolve({ active: true, expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null });
    });
    socket.once("error", () => resolve({ active: false, expiresAt: null }));
    socket.once("timeout", () => { socket.destroy(); resolve({ active: false, expiresAt: null }); });
  });
}

export async function checkCustomDomainDnsAction(workspaceId: string, input: string): Promise<DnsResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Tidak diizinkan." };
  const membership = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: session.user.id } } });
  if (!membership || !canInWorkspace(membership.role, "branding.edit")) return { ok: false, error: "Tidak diizinkan." };

  const domain = normalizeDomain(input);
  if (!isValidDomain(domain)) return { ok: false, error: "Domain tidak valid." };
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { customDomain: true, customDomainVerificationToken: true } });
  if (!workspace || workspace.customDomain !== domain) return { ok: false, error: "Simpan domain terlebih dahulu sebelum verifikasi." };

  let aRecords: string[] = [];
  let cname: string | null = null;
  let txtRecords: string[][] = [];
  try { aRecords = await dns.resolve4(domain); } catch {}
  try { cname = (await dns.resolveCname(domain))[0]?.replace(/\.+$/, "") ?? null; } catch {}
  try { txtRecords = await dns.resolveTxt(`_buildery-verification.${domain}`); } catch {}
  const pointsHere = aRecords.includes(CUSTOM_DOMAIN_TARGET_IP) || cname === PUBLIC_SITE_DOMAIN;
  const expected = `buildery-verification=${workspace.customDomainVerificationToken}`;
  const ownershipVerified = Boolean(workspace.customDomainVerificationToken && txtRecords.some((parts) => parts.join("") === expected));
  const tlsState = pointsHere && ownershipVerified ? await inspectTls(domain) : { active: false, expiresAt: null };
  const active = pointsHere && ownershipVerified;
  const error = !pointsHere ? "DNS A/CNAME belum mengarah ke Buildery." : !ownershipVerified ? "TXT verifikasi kepemilikan belum ditemukan." : null;

  await prisma.$transaction(async (tx) => {
    await tx.workspace.update({
      where: { id: workspaceId },
      data: {
        customDomainStatus: active ? "ACTIVE" : "ERROR",
        customDomainVerifiedAt: active ? new Date() : null,
        customDomainLastCheckedAt: new Date(),
        customDomainError: error,
        customDomainSslStatus: tlsState.active ? "ACTIVE" : active ? "PENDING" : "ERROR",
        customDomainSslExpiresAt: tlsState.expiresAt,
      },
    });
    await writeWorkspaceAudit(tx, { workspaceId, actorId: session.user.id, action: "domain.verified", summary: active ? `Domain ${domain} berhasil diverifikasi` : `Verifikasi domain ${domain} gagal`, targetType: "domain", metadata: { domain, pointsHere, ownershipVerified, sslActive: tlsState.active } });
  });
  revalidatePath("/dashboard/settings");
  return { ok: true, domain, targetIp: CUSTOM_DOMAIN_TARGET_IP, aRecords, cname, pointsHere, ownershipVerified, sslActive: tlsState.active, sslExpiresAt: tlsState.expiresAt?.toISOString() ?? null, status: active ? "ACTIVE" : "ERROR" };
}
