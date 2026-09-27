import "server-only";

import { randomInt } from "node:crypto";

import { sendAppEmail } from "@/lib/app-email";
import { memberClaimCodeEmail } from "@/lib/app-email-templates";
import { prisma } from "@/lib/prisma";

const CODE_TTL_MS = 15 * 60 * 1000;

function identifier(workspaceId: string, email: string) {
  return `member-claim:${workspaceId}:${email.toLowerCase().trim()}`;
}

function resetIdentifier(workspaceId: string, email: string) {
  return `member-reset:${workspaceId}:${email.toLowerCase().trim()}`;
}

function storedToken(id: string, code: string) {
  return `${id}:${code}`;
}

export async function issueMemberClaimCode(
  workspaceId: string,
  workspaceName: string,
  email: string
) {
  const normalized = email.toLowerCase().trim();
  const id = identifier(workspaceId, normalized);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");

  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier: id } }),
    prisma.verificationToken.create({
      data: {
        identifier: id,
        token: storedToken(id, code),
        expires: new Date(Date.now() + CODE_TTL_MS),
      },
    }),
  ]);

  const result = await sendAppEmail({
    to: normalized,
    ...memberClaimCodeEmail({ code, workspaceName }),
  });
  if (!result.ok && process.env.NODE_ENV === "production") {
    await prisma.verificationToken.deleteMany({ where: { identifier: id } });
    throw new Error("Verification email could not be sent.");
  }
  if (!result.ok) {
    console.warn("[member-claim] email send failed:", result.error);
  }
  if (process.env.NODE_ENV !== "production") {
    console.log(`[member-claim] code for ${normalized}: ${code}`);
  }
  return process.env.NODE_ENV === "production" ? undefined : code;
}

export async function consumeMemberClaimCode(
  workspaceId: string,
  email: string,
  rawCode: string
) {
  const code = rawCode.trim();
  if (!/^\d{6}$/.test(code)) {
    return { ok: false as const, error: "Enter the 6-digit code." };
  }

  const id = identifier(workspaceId, email);
  const record = await prisma.verificationToken.findFirst({
    where: { identifier: id, token: storedToken(id, code) },
  });
  if (!record) return { ok: false as const, error: "That code is incorrect." };
  if (record.expires.getTime() < Date.now()) {
    await prisma.verificationToken.deleteMany({ where: { identifier: id } });
    return {
      ok: false as const,
      error: "That code has expired. Request a new one.",
    };
  }

  const consumed = await prisma.verificationToken.deleteMany({
    where: { identifier: id, token: record.token },
  });
  return consumed.count === 1
    ? { ok: true as const }
    : { ok: false as const, error: "That code has already been used." };
}

export async function issueMemberResetCode(
  workspaceId: string,
  workspaceName: string,
  email: string
) {
  const normalized = email.toLowerCase().trim();
  const id = resetIdentifier(workspaceId, normalized);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier: id } }),
    prisma.verificationToken.create({
      data: {
        identifier: id,
        token: storedToken(id, code),
        expires: new Date(Date.now() + CODE_TTL_MS),
      },
    }),
  ]);
  const result = await sendAppEmail({
    to: normalized,
    ...memberClaimCodeEmail({ code, workspaceName }),
  });
  if (!result.ok && process.env.NODE_ENV === "production") {
    await prisma.verificationToken.deleteMany({ where: { identifier: id } });
    throw new Error("Reset email could not be sent.");
  }
  return process.env.NODE_ENV === "production" ? undefined : code;
}

export async function consumeMemberResetCode(
  workspaceId: string,
  email: string,
  rawCode: string
) {
  const code = rawCode.trim();
  if (!/^\d{6}$/.test(code)) return { ok: false as const, error: "Enter the 6-digit code." };
  const id = resetIdentifier(workspaceId, email);
  const record = await prisma.verificationToken.findFirst({
    where: { identifier: id, token: storedToken(id, code) },
  });
  if (!record || record.expires < new Date()) {
    return { ok: false as const, error: "That code is incorrect or expired." };
  }
  const consumed = await prisma.verificationToken.deleteMany({ where: { identifier: id, token: record.token } });
  return consumed.count === 1
    ? { ok: true as const }
    : { ok: false as const, error: "That code has already been used." };
}
