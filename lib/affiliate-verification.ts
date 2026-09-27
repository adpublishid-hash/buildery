import "server-only";

import { randomInt } from "node:crypto";

import { sendAppEmail } from "@/lib/app-email";
import { prisma } from "@/lib/prisma";

const CODE_TTL_MS = 15 * 60 * 1000;

function identifier(workspaceId: string, email: string) {
  return `affiliate-application:${workspaceId}:${email.toLowerCase().trim()}`;
}

function storedToken(id: string, code: string) {
  return `${id}:${code}`;
}

export async function issueAffiliateVerificationCode(
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
    subject: `Kode verifikasi affiliate ${workspaceName}`,
    text: `Kode verifikasi affiliate kamu adalah ${code}. Kode berlaku 15 menit.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#18181b"><h2>Verifikasi affiliate</h2><p>Masukkan kode berikut untuk melanjutkan pendaftaran di ${escapeHtml(workspaceName)}.</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>Kode berlaku 15 menit.</p></div>`,
  });
  if (!result.ok && process.env.NODE_ENV === "production") {
    await prisma.verificationToken.deleteMany({ where: { identifier: id } });
    throw new Error("Verification email could not be sent.");
  }
  if (!result.ok) console.warn("[affiliate-verification] email send failed:", result.error);
  return process.env.NODE_ENV === "production" ? undefined : code;
}

export async function consumeAffiliateVerificationCode(
  workspaceId: string,
  email: string,
  rawCode: string
) {
  const code = rawCode.trim();
  if (!/^\d{6}$/.test(code)) {
    return { ok: false as const, error: "Masukkan kode 6 digit." };
  }
  const id = identifier(workspaceId, email);
  const record = await prisma.verificationToken.findFirst({
    where: { identifier: id, token: storedToken(id, code) },
  });
  if (!record || record.expires < new Date()) {
    return { ok: false as const, error: "Kode salah atau sudah kedaluwarsa." };
  }
  const consumed = await prisma.verificationToken.deleteMany({
    where: { identifier: id, token: record.token },
  });
  return consumed.count === 1
    ? { ok: true as const }
    : { ok: false as const, error: "Kode sudah digunakan." };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char] ?? char);
}
