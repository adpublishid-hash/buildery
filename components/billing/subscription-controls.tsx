"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  cancelSubscriptionAction,
  resumeSubscriptionAction,
} from "@/lib/actions/subscription";

/**
 * Pembatalan di sini menjadwalkan berhenti di akhir periode, bukan mencabut
 * akses seketika — masa aktif yang sudah dibayar tetap milik pelanggan. Selama
 * belum jatuh tempo, pembatalan masih bisa dibatalkan lagi.
 */
export function SubscriptionControls({
  cancelAtPeriodEnd,
  periodEndLabel,
}: {
  cancelAtPeriodEnd: boolean;
  periodEndLabel: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function cancel() {
    startTransition(async () => {
      const res = await cancelSubscriptionAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setOpen(false);
      toast.success(
        res.data?.effectiveAt
          ? "Pembatalan dijadwalkan di akhir periode."
          : "Langganan dihentikan."
      );
      router.refresh();
    });
  }

  function resume() {
    startTransition(async () => {
      const res = await resumeSubscriptionAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Langganan dilanjutkan.");
      router.refresh();
    });
  }

  if (cancelAtPeriodEnd) {
    return (
      <Button variant="outline" onClick={resume} disabled={pending}>
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RotateCcw className="h-4 w-4" />
        )}
        Lanjutkan langganan
      </Button>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline">Batalkan langganan</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Batalkan perpanjangan otomatis?</AlertDialogTitle>
          <AlertDialogDescription>
            {periodEndLabel
              ? `Plan tetap aktif sampai ${periodEndLabel}, lalu turun ke Gratis. Kamu bisa membatalkan keputusan ini kapan saja sebelum tanggal tersebut.`
              : "Plan akan turun ke Gratis. Kamu bisa berlangganan lagi kapan saja."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            Tetap berlangganan
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              cancel();
            }}
            disabled={pending}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Batalkan
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
