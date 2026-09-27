"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ManualPaymentProofForm({
  orderId,
  accessToken,
  initialStatus,
}: {
  orderId: string;
  accessToken: string;
  initialStatus: "NOT_SUBMITTED" | "PENDING" | "VERIFIED" | "REJECTED";
}) {
  const [status, setStatus] = useState(initialStatus);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "VERIFIED") {
    return <p className="flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Bukti pembayaran sudah diverifikasi.</p>;
  }

  return (
    <form
      className="mt-4 space-y-3 border-t border-amber-200 pt-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        const body = new FormData(event.currentTarget);
        body.set("accessToken", accessToken);
        const response = await fetch(`/api/site/orders/${orderId}/payment-proof`, {
          method: "POST",
          body,
        });
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        setPending(false);
        if (!response.ok) {
          setError(result.error || "Upload gagal.");
          return;
        }
        setStatus("PENDING");
      }}
    >
      <div>
        <p className="text-sm font-semibold text-amber-950">Bukti transfer</p>
        <p className="mt-1 text-xs text-amber-800">
          {status === "PENDING"
            ? "Bukti sudah dikirim dan menunggu verifikasi. Kirim ulang untuk mengganti bukti."
            : status === "REJECTED"
              ? "Bukti sebelumnya ditolak. Silakan kirim bukti yang benar."
              : "Unggah screenshot atau foto transfer agar admin dapat memverifikasi."}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="payment-proof">Gambar bukti</Label>
        <Input id="payment-proof" name="file" type="file" accept="image/png,image/jpeg,image/webp" required disabled={pending} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="payment-proof-note">Catatan (opsional)</Label>
        <Textarea id="payment-proof-note" name="note" rows={2} maxLength={1000} disabled={pending} />
      </div>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Upload />}
        {pending ? "Mengunggah..." : status === "PENDING" ? "Ganti bukti" : "Kirim bukti"}
      </Button>
    </form>
  );
}
