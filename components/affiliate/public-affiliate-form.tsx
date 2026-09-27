"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Copy, Loader2, MailCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { joinAffiliateProgramAction } from "@/lib/actions/affiliate";

type JoinResult = {
  verificationRequired?: boolean;
  devCode?: string;
  status?: "PENDING" | "ACTIVE" | "SUSPENDED" | "REJECTED" | "ARCHIVED";
  referralCode?: string;
  referralUrl?: string;
  existing?: boolean;
};

export function PublicAffiliateForm({
  workspaceSlug,
  hasTerms,
  memberRegisterUrl,
}: {
  workspaceSlug: string;
  hasTerms: boolean;
  memberRegisterUrl: string;
}) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ name: "", email: "", verificationCode: "", acceptTerms: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [result, setResult] = useState<JoinResult | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setServerError(null);
    if (hasTerms && !form.acceptTerms) {
      setServerError("Setujui ketentuan program untuk melanjutkan.");
      return;
    }
    const fd = new FormData();
    for (const [key, value] of Object.entries(form)) fd.set(key, String(value));
    startTransition(async () => {
      const res = await joinAffiliateProgramAction(workspaceSlug, fd);
      if (!res.ok) {
        setServerError(res.error);
        const flat: Record<string, string> = {};
        for (const [field, messages] of Object.entries(res.fieldErrors ?? {})) {
          if (messages?.[0]) flat[field] = messages[0];
        }
        setErrors(flat);
        return;
      }
      if (res.data?.verificationRequired) {
        setVerificationRequired(true);
        if (res.data.devCode) setForm((current) => ({ ...current, verificationCode: res.data?.devCode ?? "" }));
        toast.success("Kode verifikasi dikirim ke email");
        return;
      }
      setResult(res.data ?? null);
      toast.success(res.data?.status === "ACTIVE" ? "Affiliate aktif" : "Pendaftaran dikirim");
    });
  }

  function copyReferral() {
    if (!result?.referralUrl) return;
    navigator.clipboard?.writeText(result.referralUrl)
      .then(() => toast.success("Referral link disalin"))
      .catch(() => toast.error("Link belum bisa disalin"));
  }

  if (result) {
    const active = result.status === "ACTIVE" && result.referralUrl;
    return <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-emerald-950">{active ? "Akun affiliate sudah aktif." : "Pendaftaran sedang ditinjau."}</p>
          <p className="mt-1 text-sm text-emerald-800">
            {active ? "Link dapat langsung dibagikan." : "Tim akan mengaktifkan akun setelah peninjauan."}
          </p>
          {active ? <>
            <div className="mt-4 rounded-lg border border-emerald-200 bg-white p-3">
              <p className="font-mono text-base font-semibold text-zinc-950">{result.referralCode}</p>
              <p className="mt-1 break-all text-xs text-zinc-500">{result.referralUrl}</p>
            </div>
            <Button type="button" className="mt-4 w-full" onClick={copyReferral}><Copy /> Salin referral link</Button>
          </> : null}
          <a href={memberRegisterUrl} className="mt-3 inline-block text-sm font-medium text-emerald-900 underline underline-offset-4">Buat akun member untuk membuka dashboard affiliate</a>
        </div>
      </div>
    </div>;
  }

  return <form onSubmit={submit} className="space-y-4">
    <div className="space-y-2">
      <Label htmlFor="affiliate-name">Nama lengkap</Label>
      <Input id="affiliate-name" autoComplete="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} disabled={pending || verificationRequired} />
      {errors.name ? <p className="text-xs text-red-600">{errors.name}</p> : null}
    </div>
    <div className="space-y-2">
      <Label htmlFor="affiliate-email">Email</Label>
      <Input id="affiliate-email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} disabled={pending || verificationRequired} />
      {errors.email ? <p className="text-xs text-red-600">{errors.email}</p> : null}
    </div>
    {verificationRequired ? <div className="space-y-2">
      <Label htmlFor="affiliate-code">Kode verifikasi</Label>
      <Input id="affiliate-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={form.verificationCode} onChange={(e) => setForm((f) => ({ ...f, verificationCode: e.target.value.replace(/\D/g, "") }))} />
      {errors.verificationCode ? <p className="text-xs text-red-600">{errors.verificationCode}</p> : null}
    </div> : null}
    {hasTerms ? <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 p-3">
      <Label htmlFor="affiliate-terms" className="font-normal">Saya menyetujui ketentuan program</Label>
      <Switch id="affiliate-terms" checked={form.acceptTerms} onCheckedChange={(value) => setForm((f) => ({ ...f, acceptTerms: value }))} />
    </div> : null}
    {serverError ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{serverError}</div> : null}
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : verificationRequired ? <MailCheck /> : <UserPlus />}
      {pending ? "Memproses..." : verificationRequired ? "Verifikasi dan daftar" : "Kirim kode verifikasi"}
    </Button>
  </form>;
}
