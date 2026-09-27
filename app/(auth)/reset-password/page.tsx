import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound, Link2Off } from "lucide-react";

import { AuthCard, AuthLink, AuthNotice } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";

import { auth } from "@/lib/auth";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata = { title: "Reset Password · My Landing" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: { email?: string; token?: string };
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const email = searchParams?.email ?? "";
  const token = searchParams?.token ?? "";
  const validLink = email.includes("@") && token.length >= 20;

  return (
    <AuthCard
      eyebrow="Reset password"
      icon={KeyRound}
      title="Buat password baru"
      description={validLink ? `Untuk akun ${email}.` : undefined}
      footer={
        <>
          Ingat password? <AuthLink href="/login">Kembali ke masuk</AuthLink>
        </>
      }
    >
      {validLink ? (
        <ResetPasswordForm email={email} token={token} />
      ) : (
        <AuthNotice
          icon={Link2Off}
          title="Link reset tidak valid"
          action={
            <Button asChild size="lg" className="w-full">
              <Link href="/forgot-password">Minta link baru</Link>
            </Button>
          }
        >
          Link mungkin sudah kedaluwarsa atau terpotong. Minta link baru, lalu buka link terbaru
          dari email kamu.
        </AuthNotice>
      )}
    </AuthCard>
  );
}
