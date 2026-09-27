"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { CircleCheck, Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";

import { AuthNotice } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
const LENGTH = 6;

type Props = {
  email: string;
  /** Dev-only: the pending code, surfaced because no mailer is wired up. */
  devCode?: string | null;
  callbackUrl?: string;
};

export function VerifyForm({ email, devCode, callbackUrl = "/onboarding" }: Props) {
  const router = useRouter();
  const { update: refreshSession } = useSession();
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [pending, startTransition] = useTransition();
  const [resending, setResending] = useState(false);
  const [hintCode, setHintCode] = useState<string | null>(devCode ?? null);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  function submit(code: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.message || "Kode belum bisa diverifikasi.");
        setDigits(Array(LENGTH).fill(""));
        inputsRef.current[0]?.focus();
        return;
      }
      setVerified(true);
      toast.success("Email terverifikasi");
      // Refresh the JWT cookie so middleware sees the new emailVerified
      // value, then move on to the workspace step.
      await refreshSession();
      setTimeout(() => {
        router.push(callbackUrl);
        router.refresh();
      }, 700);
    });
  }

  function setAt(index: number, value: string) {
    const next = [...digits];
    next[index] = value;
    setDigits(next);
    if (value && next.every((d) => d !== "")) {
      submit(next.join(""));
    }
  }

  function onChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    setAt(index, digit);
    if (digit && index < LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function onKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, LENGTH);
    if (!pasted) return;
    const next = Array(LENGTH).fill("");
    pasted.split("").forEach((d, i) => (next[i] = d));
    setDigits(next);
    const lastIndex = Math.min(pasted.length, LENGTH) - 1;
    inputsRef.current[lastIndex]?.focus();
    if (pasted.length === LENGTH) submit(pasted);
  }

  function resend() {
    setResending(true);
    setError(null);
    fetch("/api/auth/resend-verification", { method: "POST" })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          toast.error(json?.message || "Kode baru belum bisa dikirim");
          return;
        }
        toast.success("Kode baru sudah dikirim");
        if (json?.devCode) setHintCode(json.devCode);
        setDigits(Array(LENGTH).fill(""));
        inputsRef.current[0]?.focus();
      })
      .finally(() => setResending(false));
  }

  if (verified) {
    return (
      <AuthNotice icon={CircleCheck} title="Email terverifikasi">
        Mengarahkan ke langkah berikutnya...
      </AuthNotice>
    );
  }

  return (
    <div className="space-y-[14px]">
      <div className="flex items-center justify-between gap-[10px] rounded-[8px] border-[0.8px] border-kv-border bg-kv-secondary px-[10px] py-[8px] text-[12px]">
        <span className="flex min-w-0 items-center gap-[8px]">
          <MailCheck className="h-[14px] w-[14px] shrink-0 text-kv-secondary-fg" strokeWidth={1.6} />
          <span className="text-kv-muted-fg">Dikirim ke</span>
          <span className="truncate font-medium text-kv-fg">{email}</span>
        </span>
      </div>

      <div>
        <div className="flex justify-between gap-[8px]" onPaste={onPaste}>
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => {
                inputsRef.current[i] = el;
              }}
              value={digit}
              onChange={(e) => onChange(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              disabled={pending}
              aria-label={`Digit ${i + 1}`}
              className={cn(
                "kv-tabular h-[44px] w-full min-w-0 rounded-[8px] border-[0.8px] bg-kv-card text-center text-[18px] font-semibold text-kv-fg outline-none transition-[border-color,box-shadow] duration-150",
                "hover:border-[#d1d5db] focus:border-[#9ca3af] focus:shadow-[0_0_0_3px_rgba(156,163,175,0.18)]",
                digit && "border-[#9ca3af]",
                error ? "border-red-300" : "border-kv-border"
              )}
            />
          ))}
        </div>
        {error ? (
          <p className="mt-[8px] text-[12px] text-kv-destructive">{error}</p>
        ) : (
          <p className="mt-[8px] text-[12px] text-kv-subtle">Kode berlaku 15 menit.</p>
        )}
      </div>

      {hintCode ? (
        <div className="rounded-[8px] border-[0.8px] border-dashed border-kv-border px-[10px] py-[8px] text-[12px] text-kv-muted-fg">
          <span className="font-medium text-kv-fg">Mode dev:</span> mailer belum dikonfigurasi.
          Kodenya <span className="font-mono font-semibold text-kv-fg">{hintCode}</span>.
        </div>
      ) : null}

      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={pending || digits.some((d) => d === "")}
        onClick={() => submit(digits.join(""))}
      >
        {pending ? <Loader2 className="animate-spin" /> : null}
        {pending ? "Memverifikasi..." : "Verifikasi email"}
      </Button>

      <p className="text-center text-[12px] text-kv-muted-fg">
        Belum menerima kode?{" "}
        <button
          type="button"
          onClick={resend}
          disabled={resending}
          className="font-medium text-kv-fg underline-offset-4 hover:underline disabled:opacity-50"
        >
          {resending ? "Mengirim..." : "Kirim ulang kode"}
        </button>
      </p>
    </div>
  );
}
