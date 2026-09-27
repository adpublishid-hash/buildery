import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT =
  "https://www.googleapis.com/oauth2/v2/userinfo";

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export const GMAIL_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];

type GmailOAuthState = {
  nonce: string;
  userId: string;
  workspaceId: string;
  redirectUri: string;
  issuedAt: number;
};

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfoResponse = {
  email?: string;
  verified_email?: boolean;
};

export function getGmailOAuthRedirectUri(req: NextRequest) {
  return `${getAppBaseUrl(req)}/api/integrations/gmail/oauth/callback`;
}

export function createGmailOAuthUrl(params: {
  clientId: string;
  userId: string;
  workspaceId: string;
  redirectUri: string;
}) {
  const state = encodeGmailOAuthState({
    nonce: randomBytes(16).toString("base64url"),
    userId: params.userId,
    workspaceId: params.workspaceId,
    redirectUri: params.redirectUri,
    issuedAt: Date.now(),
  });

  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_OAUTH_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);

  return url;
}

export function readGmailOAuthState(value: string | null) {
  if (!value) return null;

  const [body, signature] = value.split(".");
  if (!body || !signature) return null;

  const expected = signStateBody(body);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const state = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as Partial<GmailOAuthState>;
    if (
      !state.nonce ||
      !state.userId ||
      !state.workspaceId ||
      !state.redirectUri ||
      typeof state.issuedAt !== "number"
    ) {
      return null;
    }
    if (Date.now() - state.issuedAt > STATE_MAX_AGE_MS) return null;

    return state as GmailOAuthState;
  } catch {
    return null;
  }
}

export async function exchangeGmailOAuthCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  const body = new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => null)) as
    | GoogleTokenResponse
    | null;

  if (!res.ok || !json?.access_token) {
    const detail =
      json?.error_description || json?.error || `HTTP ${res.status}`;
    throw new Error(`Gmail OAuth exchange failed: ${detail}`);
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
  };
}

export async function fetchGmailOAuthEmail(accessToken: string) {
  const res = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;

  const json = (await res.json().catch(() => null)) as
    | GoogleUserInfoResponse
    | null;
  if (!json?.email || json.verified_email === false) return null;

  return json.email.trim().toLowerCase();
}

function encodeGmailOAuthState(state: GmailOAuthState) {
  const body = Buffer.from(JSON.stringify(state), "utf8").toString(
    "base64url"
  );
  return `${body}.${signStateBody(body)}`;
}

function signStateBody(body: string) {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required for Gmail OAuth state.");
  }

  return createHmac("sha256", secret).update(body).digest("base64url");
}

function getAppBaseUrl(req: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  if (!host) return "http://localhost:3000";

  return `${proto}://${host}`.replace(/\/+$/, "");
}
