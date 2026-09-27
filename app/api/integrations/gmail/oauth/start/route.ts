import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import {
  createGmailOAuthUrl,
  getGmailOAuthRedirectUri,
} from "@/lib/gmail-oauth-connect";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return redirectToLogin(req);

  const current = await getCurrentWorkspace(session.user.id);
  if (!current) return redirectToSettings(req, "missing_workspace");
  if (!canInWorkspace(current.role, "branding.edit")) {
    return redirectToSettings(req, "forbidden");
  }

  const integration = await prisma.integrationSetting.findUnique({
    where: { workspaceId: current.workspace.id },
    select: { gmailClientId: true, gmailClientSecret: true },
  });

  const clientId = integration?.gmailClientId?.trim();
  const clientSecret = integration?.gmailClientSecret?.trim();
  if (!clientId || !clientSecret) return redirectToSettings(req, "missing");

  const redirectUri = getGmailOAuthRedirectUri(req);
  const googleUrl = createGmailOAuthUrl({
    clientId,
    userId: session.user.id,
    workspaceId: current.workspace.id,
    redirectUri,
  });

  return NextResponse.redirect(googleUrl);
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
