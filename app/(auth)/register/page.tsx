import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";

import { AuthCard, AuthLink } from "@/components/auth/auth-card";

import { auth, googleAuthEnabled } from "@/lib/auth";

import { AuthDivider, GoogleSignInButton } from "../google-sign-in-button";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Daftar · My Landing" };

export default async function RegisterPage({ searchParams }: { searchParams?: { callbackUrl?: string | string[]; email?: string } }) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  const callbackUrl = safeCallbackUrl(searchParams?.callbackUrl);

  return (
    <AuthCard
      eyebrow="Daftar"
      icon={UserPlus}
      title="Buat akun baru"
      description="Gratis untuk mulai. Tanpa kartu kredit, upgrade kapan saja."
      footer={
        <>
          Sudah punya akun?{" "}
          <AuthLink href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}>Masuk</AuthLink>
        </>
      }
    >
      {googleAuthEnabled ? (
        <div className="mb-[16px] space-y-[16px]">
          <GoogleSignInButton label="Daftar dengan Google" callbackUrl={callbackUrl} />
          <AuthDivider label="atau pakai email" />
        </div>
      ) : null}
      <RegisterForm callbackUrl={callbackUrl} initialEmail={searchParams?.email ?? ""} />
    </AuthCard>
  );
}

function safeCallbackUrl(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/onboarding";
}
