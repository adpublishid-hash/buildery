"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";

import { FieldError, FormAlert } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema, type LoginInput } from "@/lib/zod";

const REMEMBERED_EMAIL_KEY = "my-landing:remembered-login-email";

export function LoginForm({
  callbackUrl = "/dashboard",
}: {
  callbackUrl?: string;
}) {
  const router = useRouter();

  const [serverError, setServerError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    const rememberedEmail = window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (!rememberedEmail) return;

    setValue("email", rememberedEmail);
    setRememberMe(true);
  }, [setValue]);

  async function onSubmit(values: LoginInput) {
    setServerError(null);

    const res = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });

    if (!res || res.error) {
      setServerError("Email atau password salah.");
      return;
    }

    if (rememberMe) {
      window.localStorage.setItem(
        REMEMBERED_EMAIL_KEY,
        values.email.trim().toLowerCase()
      );
    } else {
      window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-[14px]">
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

      <div className="space-y-[6px]">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-[12px] text-kv-muted-fg underline-offset-4 transition-colors hover:text-kv-fg hover:underline"
          >
            Lupa password?
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          disabled={isSubmitting}
          className="h-[36px]"
          {...register("password")}
        />
        {process.env.NODE_ENV === "development" ? (
          <p className="text-[12px] leading-[1.4] text-kv-muted-fg">
            Hint akun demo: <span className="font-medium text-kv-secondary-fg">Password123!</span>
          </p>
        ) : null}
        <FieldError message={errors.password?.message} />
      </div>

      <label className="flex w-fit cursor-pointer items-center gap-[8px] text-[12px] text-kv-muted-fg">
        <input
          type="checkbox"
          checked={rememberMe}
          disabled={isSubmitting}
          onChange={(event) => {
            const checked = event.target.checked;
            setRememberMe(checked);
            if (!checked) {
              window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
            }
          }}
          className="h-[14px] w-[14px] rounded-[4px] border-kv-border accent-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        />
        Ingat saya
      </label>

      {serverError ? <FormAlert>{serverError}</FormAlert> : null}

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="animate-spin" /> Memproses...
          </>
        ) : (
          "Masuk"
        )}
      </Button>
    </form>
  );
}
