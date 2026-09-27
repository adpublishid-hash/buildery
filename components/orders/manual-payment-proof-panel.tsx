"use client";

import { useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { reviewManualPaymentProofAction } from "@/lib/actions/order";

export function ManualPaymentProofPanel({
  paymentId,
  proofUrl,
  note,
  status,
  canEdit,
}: {
  paymentId: string;
  proofUrl: string;
  note: string | null;
  status: string;
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const review = (decision: "VERIFIED" | "REJECTED") =>
    startTransition(async () => {
      const result = await reviewManualPaymentProofAction(paymentId, decision);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(decision === "VERIFIED" ? "Pembayaran diverifikasi" : "Bukti ditolak");
    });

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">Bukti transfer</p>
        <span className="text-xs uppercase text-zinc-500">{status.toLowerCase()}</span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <a href={proofUrl} target="_blank" rel="noreferrer"><img src={proofUrl} alt="Bukti transfer" className="max-h-72 w-full rounded-md bg-zinc-50 object-contain" /></a>
      {note ? <p className="whitespace-pre-line text-xs text-zinc-600 dark:text-zinc-300">{note}</p> : null}
      {canEdit && status === "PENDING" ? (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => review("VERIFIED")} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Check />} Terima</Button>
          <Button size="sm" variant="outline" onClick={() => review("REJECTED")} disabled={pending}><X /> Tolak</Button>
        </div>
      ) : null}
    </div>
  );
}
