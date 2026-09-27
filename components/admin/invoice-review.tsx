"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  approveSaaSInvoiceAction,
  rejectSaaSInvoiceAction,
} from "@/lib/actions/admin";

/**
 * Menyetujui tagihan langsung memperpanjang masa aktif pelanggan, jadi
 * dikonfirmasi dulu. Penolakan wajib beralasan — alasannya dikirim ke
 * pelanggan lewat email supaya mereka tahu apa yang harus diperbaiki.
 */
export function InvoiceReview({
  invoiceId,
  invoiceNumber,
  amountLabel,
}: {
  invoiceId: string;
  invoiceNumber: string;
  amountLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  function approve() {
    startTransition(async () => {
      const res = await approveSaaSInvoiceAction(invoiceId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setConfirming(false);
      toast.success(`${invoiceNumber} disetujui`);
      router.refresh();
    });
  }

  function reject() {
    startTransition(async () => {
      const res = await rejectSaaSInvoiceAction(invoiceId, reason);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setRejecting(false);
      setReason("");
      toast.success(`${invoiceNumber} ditolak`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => setConfirming(true)} disabled={pending}>
        <Check className="h-4 w-4" />
        Setujui
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setRejecting(true)}
        disabled={pending}
      >
        <X className="h-4 w-4" />
        Tolak
      </Button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Setujui {invoiceNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              Pastikan {amountLabel} benar-benar masuk sampai digit terakhir.
              Masa aktif pelanggan diperpanjang seketika dan email konfirmasi
              terkirim.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                approve();
              }}
              disabled={pending}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Setujui pembayaran
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={rejecting} onOpenChange={setRejecting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tolak {invoiceNumber}</AlertDialogTitle>
            <AlertDialogDescription>
              Alasan ini dikirim ke pelanggan lewat email.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Nominal tidak cocok, bukti tidak terbaca, …"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                reject();
              }}
              disabled={pending || !reason.trim()}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Tolak pembayaran
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
