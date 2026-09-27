import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import {
  exchangeGmailOAuthCode,
  fetchGmailOAuthEmail,
  readGmailOAuthState,
} from "@/lib/gmail-oauth-connect";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const error = req.nextUrl.searchParams.get("error");
  if (error) return redirectToSettings(req, "denied");

  const code = req.nextUrl.searchParams.get("code");
  const state = readGmailOAuthState(req.nextUrl.searchParams.get("state"));
  if (!code || !state) return redirectToSettings(req, "invalid");

  const session = await auth();
  if (!session?.user) return redirectToLogin(req);
  if (session.user.id !== state.userId) {
    return redirectToSettings(req, "invalid");
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: state.workspaceId,
        userId: session.user.id,
      },
    },
  });
  if (!membership || !canInWorkspace(membership.role, "branding.edit")) {
    return redirectToSettings(req, "forbidden");
  }

  const integration = await prisma.integrationSetting.findUnique({
    where: { workspaceId: state.workspaceId },
    select: {
      gmailClientId: true,
      gmailClientSecret: true,
      gmailSenderEmail: true,
    },
  });

  const clientId = integration?.gmailClientId?.trim();
  const clientSecret = integration?.gmailClientSecret?.trim();
  if (!clientId || !clientSecret) return redirectToSettings(req, "missing");

  try {
    const token = await exchangeGmailOAuthCode({
      code,
      clientId,
      clientSecret,
      redirectUri: state.redirectUri,
    });
    if (!token.refreshToken) {
      return redirectToSettings(req, "no_refresh_token");
    }

    const gmailEmail = await fetchGmailOAuthEmail(token.accessToken);
    await prisma.integrationSetting.update({
      where: { workspaceId: state.workspaceId },
      data: {
        gmailOAuthEnabled: true,
        gmailRefreshToken: token.refreshToken,
        gmailSenderEmail:
          gmailEmail || integration?.gmailSenderEmail?.trim().toLowerCase(),
      },
    });

    revalidatePath("/dashboard/settings/integrations");
    return redirectToSettings(req, "connected");
  } catch (error) {
    console.warn("[gmail-oauth] callback failed", error);
    return redirectToSettings(req, "token_failed");
  }
}

function redirectToLogin(req: NextRequest) {
  const url = new URL("/login", req.url);
  url.searchParams.set("callbackUrl", "/dashboard/settings/integrations");
  return NextResponse.redirect(url);
}

function redirectToSettings(req: NextRequest, status: string) {
  const url = new URL("/dashboard/settings/integrations", req.url);
  url.searchParams.set("gmail", status);
  return NextResponse.redirect(url);
}
