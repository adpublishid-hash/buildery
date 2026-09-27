"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, PlugZap, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { testIntegrationConnectionAction } from "@/lib/actions/integration";
import { cn } from "@/lib/utils";

type Outcome = { ok: boolean; text: string } | null;

/**
 * Menguji satu kredensial tersimpan tanpa mengirim apa pun ke pelanggan.
 *
 * Meta, TikTok, dan GA4 sudah punya tombol serupa; tanpa ini, kredensial
 * Midtrans, email, Telegram, dan WhatsApp baru ketahuan salah saat order atau
 * notifikasi pertama gagal.
 */
export function ConnectionTestButton({
  provider,
  label,
  disabled,
}: {
  provider: "MIDTRANS" | "MAILKETING" | "GMAIL" | "TELEGRAM" | "WHATSAPP";
  label?: string;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<Outcome>(null);

  function run() {
    setOutcome(null);
    startTransition(async () => {
      const res = await testIntegrationConnectionAction(provider);
      setOutcome(
        res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error }
      );
    });
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={run}
        disabled={pending || disabled}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <PlugZap className="h-4 w-4" />
        )}
        {label ?? "Tes koneksi"}
      </Button>

      {outcome ? (
        <p
          className={cn(
            "flex items-start gap-2 rounded-md border p-2 text-xs",
            outcome.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
          )}
        >
          {outcome.ok ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          {outcome.text}
        </p>
      ) : null}
    </div>
  );
}
