import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "bd_member_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type SessionPayload = {
  workspaceId: string;
  customerId: string;
  exp: number;
  version: number;
};

export type MemberSession = {
  workspaceId: string;
  workspaceSlug: string;
  customerId: string;
  name: string;
  email: string;
  phone: string | null;
};

function secret() {
  const value = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  // The fallback below is public knowledge — anyone could mint a session with
  // it. Acceptable on a developer's machine, never in production.
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error("NEXTAUTH_SECRET is required in production.");
  }
  return value || "local-member-session-secret";
}

function base64Url(input: string) {
  return Buffer.from(input).toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function encode(payload: SessionPayload) {
  const body = base64Url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

function decode(value: string): SessionPayload | null {
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (
      typeof parsed.workspaceId !== "string" ||
      typeof parsed.customerId !== "string" ||
      typeof parsed.exp !== "number" ||
      typeof parsed.version !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function setMemberSession(input: {
  workspaceId: string;
  customerId: string;
  version?: number;
}) {
  // Fail closed before doing any database work when production is misconfigured.
  secret();
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const version = input.version ?? (await prisma.customer.findUniqueOrThrow({
    where: { id: input.customerId },
    select: { sessionVersion: true },
  })).sessionVersion;
  cookies().set(COOKIE_NAME, encode({ ...input, version, exp }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearMemberSession() {
  cookies().delete(COOKIE_NAME);
}

export async function getMemberSession(
  workspaceSlug?: string
): Promise<MemberSession | null> {
  const raw = cookies().get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const payload = decode(raw);
  if (!payload || payload.exp < Math.floor(Date.now() / 1000)) return null;

  const customer = await prisma.customer.findUnique({
    where: { id: payload.customerId },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      email: true,
      phone: true,
      sessionVersion: true,
      workspace: { select: { slug: true } },
    },
  });
  if (!customer || customer.workspaceId !== payload.workspaceId) return null;
  if (customer.sessionVersion !== payload.version) return null;
  if (workspaceSlug && customer.workspace.slug !== workspaceSlug) return null;

  return {
    workspaceId: customer.workspaceId,
    workspaceSlug: customer.workspace.slug,
    customerId: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
  };
}
