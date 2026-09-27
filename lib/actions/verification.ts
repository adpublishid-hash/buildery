"use server";

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { issueVerificationCode, verifyEmailCode } from "@/lib/verification";
import { reportError } from "@/lib/error-reporting";

type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

/** Confirms the signed-in user's email with a 6-digit code. */
export async function verifyEmailAction(code: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { emailVerified: true },
  });
  if (user?.emailVerified) return { ok: true };

  return verifyEmailCode(session.user.email, code);
}

/** Re-issues a verification code. In dev the code is returned for testing. */
export async function resendVerificationAction(): Promise<
  { ok: true; devCode?: string } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  try {
    const code = await issueVerificationCode(session.user.email);
    return {
      ok: true,
      devCode: process.env.NODE_ENV === "production" ? undefined : code,
    };
  } catch (error) {
    reportError("verify resend failed", error);
    return { ok: false, error: "Could not send a new code. Try again." };
  }
}
