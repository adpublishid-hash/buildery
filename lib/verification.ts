import "server-only";

import { randomInt } from "node:crypto";

import { sendAppEmail } from "@/lib/app-email";
import {
  verificationCodeEmail,
  welcomeEmail,
} from "@/lib/app-email-templates";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/error-reporting";

// Codes are valid for 15 minutes.
const CODE_TTL_MS = 15 * 60 * 1000;

/** Six-digit numeric verification code. */
export function generateVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

// VerificationToken.token is globally unique, so we namespace the stored
// value by email — the customer still only ever types the 6 digits.
function composite(email: string, code: string) {
  return `${email.toLowerCase()}:${code}`;
}

/**
 * Issues a fresh verification code for an email, replacing any previous
 * one. Returns the code so local development can still show it on screen.
 */
export async function issueVerificationCode(email: string): Promise<string> {
  const normalized = email.toLowerCase();
  const code = generateVerificationCode();

  await prisma.verificationToken.deleteMany({
    where: { identifier: normalized },
  });
  await prisma.verificationToken.create({
    data: {
      identifier: normalized,
      token: composite(normalized, code),
      expires: new Date(Date.now() + CODE_TTL_MS),
    },
  });

  const emailContent = verificationCodeEmail(code);
  const result = await sendAppEmail({ to: normalized, ...emailContent });

  if (!result.ok) {
    reportError("verify email send failed", result.error);
    // Callers use a rejected promise to trigger the automatic fallback send
    // or show an honest resend error. Keeping this as a successful return made
    // registration report that the message was sent even when SMTP failed.
    throw new Error(`Verification email could not be sent: ${result.error}`);
  }
  if (process.env.NODE_ENV !== "production") {
    console.log(`[verify] code for ${normalized}: ${code}`);
  }
  return code;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Checks a code for an email. On success the token is consumed and the
 * user's `emailVerified` timestamp is set.
 */
export async function verifyEmailCode(
  email: string,
  rawCode: string
): Promise<VerifyResult> {
  const normalized = email.toLowerCase();
  const code = rawCode.trim();

  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: "Enter the 6-digit code." };
  }

  const record = await prisma.verificationToken.findFirst({
    where: { identifier: normalized, token: composite(normalized, code) },
  });

  if (!record) {
    return { ok: false, error: "That code is incorrect." };
  }
  if (record.expires.getTime() < Date.now()) {
    await prisma.verificationToken.deleteMany({
      where: { identifier: normalized },
    });
    return { ok: false, error: "That code has expired. Request a new one." };
  }

  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: { name: true, emailVerified: true },
  });
  if (!user) {
    await prisma.verificationToken.deleteMany({
      where: { identifier: normalized },
    });
    return { ok: false, error: "Account not found. Please register again." };
  }

  const [, updated] = await prisma.$transaction([
    prisma.verificationToken.deleteMany({
      where: { identifier: normalized },
    }),
    prisma.user.updateMany({
      where: { email: normalized },
      data: { emailVerified: new Date() },
    }),
  ]);
  if (updated.count === 0) {
    return { ok: false, error: "Account not found. Please register again." };
  }

  if (!user.emailVerified) {
    const baseUrl = getAppBaseUrl();
    const content = welcomeEmail({
      name: user.name,
      dashboardUrl: `${baseUrl}/dashboard`,
    });
    const welcome = await sendAppEmail({ to: normalized, ...content });
    if (!welcome.ok) {
      reportError("verify welcome email send failed", welcome.error);
    }
  }

  return { ok: true };
}

/** Dev helper: the current pending code for an email, if any. */
export async function peekVerificationCode(
  email: string
): Promise<string | null> {
  if (process.env.NODE_ENV === "production") return null;
  const normalized = email.toLowerCase();
  const record = await prisma.verificationToken.findFirst({
    where: { identifier: normalized },
    orderBy: { expires: "desc" },
  });
  if (!record) return null;
  const code = record.token.split(":")[1];
  return code ?? null;
}

function getAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}
