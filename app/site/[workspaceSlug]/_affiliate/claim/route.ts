import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  REFERRAL_COOKIE,
  verifyReferralToken,
} from "@/lib/affiliate";
import { prisma } from "@/lib/prisma";
import { normalizeHost, publicSiteHref } from "@/lib/public-url";

function safeDestination(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value.slice(0, 1000);
}

export async function GET(
  req: NextRequest,
  { params }: { params: { workspaceSlug: string } }
) {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: params.workspaceSlug, status: "ACTIVE" },
    select: {
      id: true,
      slug: true,
      affiliateProgram: { select: { attributionModel: true } },
    },
  });
  const destination = safeDestination(req.nextUrl.searchParams.get("to"));
  const host = normalizeHost(req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  const localSitePath = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const fallback = localSitePath
    ? new URL(publicSiteHref(params.workspaceSlug, destination), req.url)
    : new URL(destination, req.url);
  if (!workspace) return NextResponse.redirect(fallback);

  const token = req.nextUrl.searchParams.get("token");
  const payload = verifyReferralToken(token);
  if (!payload || payload.workspaceId !== workspace.id || !token) {
    return NextResponse.redirect(fallback);
  }

  const affiliate = await prisma.affiliate.findFirst({
    where: {
      id: payload.affiliateId,
      workspaceId: workspace.id,
      status: "ACTIVE",
      archivedAt: null,
      program: { isOpen: true, workspaceId: workspace.id },
    },
    select: { id: true },
  });
  if (!affiliate) return NextResponse.redirect(fallback);

  const response = NextResponse.redirect(
    localSitePath
      ? new URL(publicSiteHref(workspace.slug, destination), req.url)
      : new URL(destination, req.url)
  );
  const current = verifyReferralToken(req.cookies.get(REFERRAL_COOKIE)?.value);
  const keepFirst =
    workspace.affiliateProgram?.attributionModel === "FIRST_CLICK" &&
    current?.workspaceId === workspace.id;
  if (!keepFirst) {
    response.cookies.set(REFERRAL_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(1, Math.floor((payload.exp - Date.now()) / 1000)),
    });
  }
  return response;
}
