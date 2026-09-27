import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { issueVerificationCode, peekVerificationCode } from "@/lib/verification";
import { rateLimitShared } from "@/lib/rate-limit";
import { WizardSteps } from "@/components/onboarding/wizard-steps";
import { VerifyForm } from "@/components/onboarding/verify-form";
import { AuthCard } from "@/components/auth/auth-card";
import { MailCheck } from "lucide-react";
import { reportError } from "@/lib/error-reporting";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verifikasi email · My Landing" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams?: { send?: string; sent?: string; callbackUrl?: string };
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { emailVerified: true },
  });
  // Already verified — move on to the workspace step.
  const callbackUrl = safeCallbackUrl(searchParams?.callbackUrl);
  if (user?.emailVerified) redirect(callbackUrl);

  if (searchParams?.send === "1") {
    const limit = await rateLimitShared(
      `verify-auto-send:${session.user.email.toLowerCase()}`,
      3,
      15 * 60 * 1000
    );
    if (limit.ok) {
      let sent = false;
      try {
        await issueVerificationCode(session.user.email);
        sent = true;
      } catch (error) {
        reportError("verify automatic fallback send failed", error);
      }
      const query = new URLSearchParams({ sent: sent ? "1" : "0", callbackUrl });
      redirect(`/verify?${query}`);
    }
    redirect(`/verify?sent=0&callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const devCode = await peekVerificationCode(session.user.email);

  return (
    <div>
      <WizardSteps current={1} />
      <AuthCard
        eyebrow="Langkah 1 dari 2"
        icon={MailCheck}
        title="Verifikasi email"
        description={
          searchParams?.sent === "0"
            ? "Email belum berhasil dikirim. Gunakan “Kirim ulang kode” di bawah untuk mencoba lagi."
            : "Masukkan kode 6 digit yang kami kirim untuk memastikan ini benar-benar kamu."
        }
      >
        <VerifyForm email={session.user.email} devCode={devCode} callbackUrl={callbackUrl} />
      </AuthCard>
    </div>
  );
}

function safeCallbackUrl(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/onboarding";
}
