import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";

import { AuthCard, AuthLink } from "@/components/auth/auth-card";

import { auth } from "@/lib/auth";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = { title: "Lupa Password · My Landing" };

export default async function ForgotPasswordPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <AuthCard
      eyebrow="Reset password"
      icon={KeyRound}
      title="Lupa password?"
      description="Masukkan email akunmu. Kami kirim link untuk mengatur ulang password."
      footer={
        <>
          Ingat password? <AuthLink href="/login">Kembali ke masuk</AuthLink>
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
