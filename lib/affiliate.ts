import "server-only";

import { cookies } from "next/headers";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { prisma } from "@/lib/prisma";

export const REFERRAL_COOKIE = "bd_ref";
const DEFAULT_REFERRAL_TTL_DAYS = 30;
const TOKEN_VERSION = 1;

export type ReferralCookie = {
  v: number;
  workspaceId: string;
  affiliateId: string;
  code: string;
  clickId: string;
  iat: number;
  exp: number;
};

function attributionSecret() {
  const secret = process.env.AFFILIATE_ATTRIBUTION_SECRET || process.env.NEXTAUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AFFILIATE_ATTRIBUTION_SECRET or NEXTAUTH_SECRET is required.");
  }
  return "buildery-affiliate-development-secret";
}

function signature(encoded: string) {
  return createHmac("sha256", attributionSecret()).update(encoded).digest("base64url");
}

/** Creates a short-lived, tamper-evident token safe to pass between hosts. */
export function issueReferralToken(input: {
  workspaceId: string;
  affiliateId: string;
  code: string;
  clickId?: string;
  attributionDays?: number;
}) {
  const now = Date.now();
  const days = Math.min(Math.max(input.attributionDays ?? DEFAULT_REFERRAL_TTL_DAYS, 1), 365);
  const payload: ReferralCookie = {
    v: TOKEN_VERSION,
    workspaceId: input.workspaceId,
    affiliateId: input.affiliateId,
    code: input.code,
    clickId: input.clickId ?? randomBytes(12).toString("base64url"),
    iat: now,
    exp: now + days * 24 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function verifyReferralToken(raw: string | null | undefined): ReferralCookie | null {
  if (!raw || raw.length > 2048) return null;
  const [encoded, provided, extra] = raw.split(".");
  if (!encoded || !provided || extra) return null;
  const expectedBuffer = Buffer.from(signature(encoded));
  const providedBuffer = Buffer.from(provided);
  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<ReferralCookie>;
    if (
      parsed.v !== TOKEN_VERSION ||
      typeof parsed.workspaceId !== "string" ||
      typeof parsed.affiliateId !== "string" ||
      typeof parsed.code !== "string" ||
      typeof parsed.clickId !== "string" ||
      typeof parsed.iat !== "number" ||
      typeof parsed.exp !== "number" ||
      parsed.iat > Date.now() + 60_000 ||
      parsed.exp <= Date.now()
    ) return null;
    return parsed as ReferralCookie;
  } catch {
    return null;
  }
}

export function readReferralCookie(): ReferralCookie | null {
  return verifyReferralToken(cookies().get(REFERRAL_COOKIE)?.value);
}

export function writeReferralCookie(token: string) {
  const payload = verifyReferralToken(token);
  if (!payload) return false;
  cookies().set(REFERRAL_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(1, Math.floor((payload.exp - Date.now()) / 1000)),
  });
  return true;
}

/** Revalidates cookie attribution against tenant, affiliate, and program state. */
export async function getActiveAffiliateFor(workspaceId: string) {
  const cookie = readReferralCookie();
  if (!cookie || cookie.workspaceId !== workspaceId) return null;
  const affiliate = await prisma.affiliate.findFirst({
    where: {
      id: cookie.affiliateId,
      workspaceId,
      status: "ACTIVE",
      archivedAt: null,
      program: { isOpen: true, workspaceId },
    },
    select: {
      id: true,
      workspaceId: true,
      customerId: true,
      referralCode: true,
      program: {
        select: {
          id: true,
          commissionPercent: true,
          holdDays: true,
          allowSelfReferral: true,
          includeShipping: true,
          includeTax: true,
          includeFees: true,
        },
      },
    },
  });
  return affiliate ? { ...cookie, affiliate } : null;
}

export async function findActiveAffiliateByCode(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const direct = await prisma.affiliate.findUnique({
    where: { referralCode: normalized },
    include: {
      workspace: { select: { id: true, slug: true, customDomain: true, createdById: true } },
      program: true,
    },
  });
  const alias = direct ? null : await prisma.affiliateCodeAlias.findFirst({
    where: { code: normalized, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    include: {
      affiliate: {
        include: {
          workspace: { select: { id: true, slug: true, customDomain: true, createdById: true } },
          program: true,
        },
      },
    },
  });
  const affiliate = direct ?? alias?.affiliate;
  if (
    !affiliate || affiliate.status !== "ACTIVE" || affiliate.archivedAt ||
    !affiliate.program.isOpen || affiliate.workspaceId !== affiliate.program.workspaceId
  ) return null;
  return affiliate;
}

export function hashReferralValue(value: string) {
  return createHmac("sha256", attributionSecret())
    .update(value.trim().toLowerCase())
    .digest("hex");
}

export function isLikelyBot(userAgent: string | null) {
  return /bot|crawler|spider|slurp|preview|facebookexternalhit|whatsapp|telegram/i.test(userAgent ?? "");
}

export function referralDeviceType(userAgent: string | null) {
  if (!userAgent) return "unknown";
  if (/tablet|ipad/i.test(userAgent)) return "tablet";
  if (/mobile|android|iphone/i.test(userAgent)) return "mobile";
  return "desktop";
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Generates a candidate. Callers still retry a unique create on P2002. */
export async function generateReferralCode(length = 7): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const bytes = randomBytes(length);
    let code = "";
    for (let i = 0; i < length; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
    const [affiliate, alias] = await Promise.all([
      prisma.affiliate.findUnique({ where: { referralCode: code }, select: { id: true } }),
      prisma.affiliateCodeAlias.findUnique({ where: { code }, select: { id: true } }),
    ]);
    if (!affiliate && !alias) return code;
  }
  return createHash("sha256")
    .update(`${Date.now()}:${randomBytes(16).toString("hex")}`)
    .digest("base64url").slice(0, length).toUpperCase();
}
