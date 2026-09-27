"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Mail, MailCheck } from "lucide-react";

import { AuthNotice, FieldError } from "@/components/auth/auth-card";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, "Email wajib diisi")
    .email("Format email tidak valid"),
});

type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordInput) {
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok && res.status !== 429) {
      // Keep the response generic so registered emails cannot be guessed.
      console.error("[forgot-password]", await res.text().catch(() => ""));
    }
    setSentTo(values.email);
  }

  if (sentTo) {
    return (
      <AuthNotice
        icon={MailCheck}
        title="Cek email kamu"
        action={
          <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => setSentTo(null)}>
            Pakai email lain
          </Button>
        }
      >
        Jika <span className="font-medium text-kv-fg">{sentTo}</span> terdaftar, link reset
        password sudah dikirim. Link berlaku 60 menit.
      </AuthNotice>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-[14px]">
      <div className="space-y-[6px]">
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Mail
            className="pointer-events-none absolute left-[10px] top-1/2 h-[16px] w-[16px] -translate-y-1/2 text-kv-muted-fg"
            strokeWidth={1.6}
            aria-hidden="true"
          />
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="h-[36px] pl-[34px]"
            {...register("email")}
          />
        </div>
        <FieldError message={errors.email?.message} />
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="animate-spin" /> Mengirim link...
          </>
        ) : (
          "Kirim link reset"
        )}
      </Button>
    </form>
  );
}
