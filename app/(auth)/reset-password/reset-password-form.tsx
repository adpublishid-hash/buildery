"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CircleCheck, Loader2 } from "lucide-react";

import { AuthNotice, FieldError, FormAlert } from "@/components/auth/auth-card";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password minimal 8 karakter").max(100),
    confirmPassword: z.string().min(1, "Ulangi password"),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Password tidak sama",
  });

type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordForm({
  email,
  token,
}: {
  email: string;
  token: string;
}) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  async function onSubmit(values: ResetPasswordInput) {
    setServerError(null);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, email, token }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setServerError(data?.message ?? "Password belum bisa diubah.");
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <AuthNotice
        icon={CircleCheck}
        title="Password berhasil diubah"
        action={
          <Button asChild size="lg" className="w-full">
            <Link href="/login">Masuk sekarang</Link>
          </Button>
        }
      >
        Kamu bisa masuk lagi dengan password baru.
      </AuthNotice>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-[14px]">
      <div className="space-y-[6px]">
        <Label htmlFor="password">Password baru</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          placeholder="Minimal 8 karakter"
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
          placeholder="Ketik password sekali lagi"
          disabled={isSubmitting}
          className="h-[36px]"
          {...register("confirmPassword")}
        />
        <FieldError message={errors.confirmPassword?.message} />
      </div>
      {serverError ? <FormAlert>{serverError}</FormAlert> : null}
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="animate-spin" /> Menyimpan...
          </>
        ) : (
          "Simpan password baru"
        )}
      </Button>
    </form>
  );
}
