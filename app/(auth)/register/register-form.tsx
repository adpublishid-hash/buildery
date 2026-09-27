"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";

import { FieldError, FormAlert } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerSchema, type RegisterInput } from "@/lib/zod";

export function RegisterForm({ callbackUrl = "/onboarding", initialEmail = "" }: { callbackUrl?: string; initialEmail?: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: initialEmail,
      phone: "",
      password: "",
      confirmPassword: "",
    },
  });

  const password = watch("password");
  const strength = getPasswordStrength(password);

  async function onSubmit(values: RegisterInput) {
    setServerError(null);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setServerError(data?.message ?? "Akun belum bisa dibuat.");
      return;
    }

    const signInRes = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });

    if (!signInRes || signInRes.error) {
      router.push("/login");
      return;
    }

    // The verification code is issued during registration. If SMTP failed,
    // retry automatically after the new user has been signed in.
    const query = new URLSearchParams({ callbackUrl });
    if (data?.verificationSent === false) query.set("send", "1");
    router.push(`/verify?${query}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-[14px]">
      <div className="grid gap-[14px] sm:grid-cols-2">
        <div className="space-y-[6px]">
          <Label htmlFor="name">Nama</Label>
          <Input
            id="name"
            autoComplete="name"
            placeholder="Ada Lovelace"
            disabled={isSubmitting}
            className="h-[36px]"
            {...register("name")}
          />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="space-y-[6px]">
          <Label htmlFor="phone">Nomor HP</Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="0812 3456 7890"
            disabled={isSubmitting}
            className="h-[36px]"
            {...register("phone")}
          />
          <FieldError message={errors.phone?.message} />
        </div>
      </div>

      <div className="space-y-[6px]">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          disabled={isSubmitting}
          className="h-[36px]"
          {...register("email")}
        />
        <FieldError message={errors.email?.message} />
      </div>

      <div className="grid gap-[14px] sm:grid-cols-2">
        <div className="space-y-[6px]">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="Min. 8 karakter"
            disabled={isSubmitting}
            className="h-[36px]"
            {...register("password")}
          />
          <FieldError message={errors.password?.message} />
        </div>
        <div className="space-y-[6px]">
          <Label htmlFor="confirmPassword">Ulangi password</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Sekali lagi"
            disabled={isSubmitting}
            className="h-[36px]"
            {...register("confirmPassword")}
          />
          <FieldError message={errors.confirmPassword?.message} />
        </div>
      </div>

      {password ? <PasswordStrengthMeter score={strength.score} label={strength.label} /> : null}

      {serverError ? <FormAlert>{serverError}</FormAlert> : null}

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="animate-spin" /> Membuat akun...
          </>
        ) : (
          "Buat akun"
        )}
      </Button>

      <p className="text-center text-[12px] leading-[1.5] text-kv-subtle">
        Setelah daftar, kami kirim kode verifikasi ke email kamu.
      </p>
    </form>
  );
}

function getPasswordStrength(password = "") {
  let score = 0;

  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (!password) return { score: 0, label: "Lemah" };
  if (score >= 4) return { score: 3, label: "Kuat" };
  if (score >= 2) return { score: 2, label: "Sedang" };
  return { score: 1, label: "Lemah" };
}

function PasswordStrengthMeter({
  score,
  label,
}: {
  score: number;
  label: string;
}) {
  const tone =
    score >= 3 ? "bg-kv-success" : score === 2 ? "bg-amber-500" : "bg-kv-destructive";

  return (
    <div className="flex animate-kv-fade items-center gap-[10px]" aria-live="polite">
      <div className="flex flex-1 gap-[4px]" aria-hidden="true">
        {[1, 2, 3].map((step) => (
          <span
            key={step}
            className={`h-[3px] flex-1 rounded-full transition-colors duration-300 ${
              step <= score ? tone : "bg-kv-accent"
            }`}
          />
        ))}
      </div>
      <p className="shrink-0 text-[12px] text-kv-muted-fg">
        Password <span className="font-medium text-kv-fg">{label.toLowerCase()}</span>
      </p>
    </div>
  );
}
