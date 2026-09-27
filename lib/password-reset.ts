import "server-only";

import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

import { sendAppEmail } from "@/lib/app-email";
import { passwordResetEmail } from "@/lib/app-email-templates";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/error-reporting";

const RESET_TTL_MS = 60 * 60 * 1000;
const TOKEN_PREFIX = "password-reset";

export async function requestPasswordReset(email: string) {
  const normalized = email.toLowerCase().trim();
  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: { name: true, email: true },
  });

  await prisma.verificationToken.deleteMany({
    where: { identifier: resetIdentifier(normalized) },
  });

  if (!user) return;

  const rawToken = randomBytes(32).toString("base64url");
  await prisma.verificationToken.create({
    data: {
      identifier: resetIdentifier(normalized),
      token: resetToken(rawToken),
      expires: new Date(Date.now() + RESET_TTL_MS),
    },
  });

  const content = passwordResetEmail({
    name: user.name,
    resetUrl: `${getAppBaseUrl()}/reset-password?email=${encodeURIComponent(
      normalized
    )}&token=${encodeURIComponent(rawToken)}`,
  });
  const result = await sendAppEmail({ to: normalized, ...content });
  if (!result.ok) {
    reportError("password-reset email send failed", result.error);
  }
}

export async function resetPassword(input: {
  email: string;
  token: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = input.email.toLowerCase().trim();
  const token = input.token.trim();
  if (!token) return { ok: false, error: "Link reset tidak valid." };

  const record = await prisma.verificationToken.findFirst({
    where: {
      identifier: resetIdentifier(normalized),
      token: resetToken(token),
    },
  });

  if (!record) {
    return { ok: false, error: "Link reset tidak valid atau sudah dipakai." };
  }
  if (record.expires.getTime() < Date.now()) {
    await prisma.verificationToken.deleteMany({
      where: { identifier: resetIdentifier(normalized) },
    });
    return {
      ok: false,
      error: "Link reset sudah kedaluwarsa. Minta link baru.",
    };
  }

  const hashed = await bcrypt.hash(input.password, 10);
  const [, updated] = await prisma.$transaction([
    prisma.verificationToken.deleteMany({
      where: { identifier: resetIdentifier(normalized) },
    }),
    prisma.user.updateMany({
      where: { email: normalized },
      data: { password: hashed },
    }),
  ]);

  if (updated.count === 0) {
    return { ok: false, error: "Akun tidak ditemukan." };
  }
  return { ok: true };
}

function resetIdentifier(email: string) {
  return `${TOKEN_PREFIX}:${email}`;
}

function resetToken(rawToken: string) {
  return `${TOKEN_PREFIX}:${sha256(rawToken)}`;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function getAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}
