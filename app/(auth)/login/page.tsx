import { redirect } from "next/navigation";
import { LogIn } from "lucide-react";

import { AuthCard, AuthLink } from "@/components/auth/auth-card";

import { auth, googleAuthEnabled } from "@/lib/auth";

import { AuthDivider, GoogleSignInButton } from "../google-sign-in-button";
import { LoginForm } from "./login-form";

export const metadata = { title: "Masuk · My Landing" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { callbackUrl?: string | string[] };
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  const callbackUrl = getCallbackUrl(searchParams?.callbackUrl);

  return (
    <AuthCard
      eyebrow="Masuk"
      icon={LogIn}
      title="Selamat datang kembali"
      description="Masuk untuk mengelola workspace, halaman, dan bisnismu."
      footer={
        <>
          Belum punya akun?{" "}
          <AuthLink href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`}>
            Daftar gratis
          </AuthLink>
        </>
      }
    >
      {googleAuthEnabled ? (
        <div className="mb-[16px] space-y-[16px]">
          <GoogleSignInButton label="Masuk dengan Google" callbackUrl={callbackUrl} />
          <AuthDivider label="atau pakai email" />
        </div>
      ) : null}
      <LoginForm callbackUrl={callbackUrl} />
    </AuthCard>
  );
}

function getCallbackUrl(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/dashboard";
  }
  return raw;
}
