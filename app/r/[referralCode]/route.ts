import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  findActiveAffiliateByCode,
  hashReferralValue,
  isLikelyBot,
  issueReferralToken,
  referralDeviceType,
} from "@/lib/affiliate";
import { reportError } from "@/lib/error-reporting";
import { prisma } from "@/lib/prisma";
import { publicSiteHref } from "@/lib/public-url";
import { getUserPlan } from "@/lib/saas-limits";

function safeDestination(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value.slice(0, 1000);
}

function storeOrigin(req: NextRequest, workspace: { slug: string; customDomain: string | null }) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl && /localhost|127\.0\.0\.1|\[::1\]/.test(appUrl)) {
    return new URL(publicSiteHref(workspace.slug), req.url).origin + `/site/${workspace.slug}`;
  }
  return workspace.customDomain
    ? `https://${workspace.customDomain}`
    : new URL(publicSiteHref(workspace.slug), req.url).origin;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { referralCode: string } }
) {
  const affiliate = await findActiveAffiliateByCode(params.referralCode ?? "");
  if (!affiliate || !(await getUserPlan(affiliate.workspace.createdById)).hasAffiliate) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const ua = req.headers.get("user-agent")?.slice(0, 500) ?? null;
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
  const clickId = randomBytes(12).toString("base64url");
  const bucket = Math.floor(Date.now() / (30 * 60 * 1000));
  const dedupeKey = hashReferralValue(`${affiliate.id}:${ip}:${ua ?? ""}:${bucket}`);
  const destination = safeDestination(req.nextUrl.searchParams.get("to"));
  const bot = isLikelyBot(ua);

  try {
    await prisma.referral.create({
      data: {
        affiliateId: affiliate.id,
        workspaceId: affiliate.workspaceId,
        event: "CLICK",
        clickId,
        dedupeKey,
        ipHash: ip === "unknown" ? null : hashReferralValue(ip),
        visitorHash: hashReferralValue(`${ip}:${ua ?? ""}`),
        userAgent: ua,
        landingUrl: destination,
        referrer: req.headers.get("referer")?.slice(0, 2000) ?? null,
        campaign: req.nextUrl.searchParams.get("campaign")?.slice(0, 120) ?? null,
        utmSource: req.nextUrl.searchParams.get("utm_source")?.slice(0, 120) ?? null,
        utmMedium: req.nextUrl.searchParams.get("utm_medium")?.slice(0, 120) ?? null,
        utmCampaign: req.nextUrl.searchParams.get("utm_campaign")?.slice(0, 120) ?? null,
        deviceType: referralDeviceType(ua),
        isBot: bot,
      },
    });
  } catch (error) {
    // A duplicate in the same 30-minute visitor bucket is intentionally ignored.
    if ((error as { code?: string }).code !== "P2002") {
      reportError("referral click failed", error);
    }
  }

  const token = issueReferralToken({
    workspaceId: affiliate.workspaceId,
    affiliateId: affiliate.id,
    code: affiliate.referralCode,
    clickId,
    attributionDays: affiliate.program.attributionDays,
  });
  const claim = new URL(`${storeOrigin(req, affiliate.workspace)}/_affiliate/claim`);
  claim.searchParams.set("token", token);
  claim.searchParams.set("to", destination);
  return NextResponse.redirect(claim);
}
