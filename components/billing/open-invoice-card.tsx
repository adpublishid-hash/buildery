"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PaymentDialog } from "@/components/billing/payment-dialog";
import {
  cancelInvoiceAction,
  type CheckoutInvoice,
} from "@/lib/actions/subscription";
import { formatPrice } from "@/lib/utils";

/**
 * Tagihan yang belum selesai, ditampilkan di halaman billing supaya pelanggan
 * bisa kembali ke QRIS dan nominal yang sama — bukan menerbitkan tagihan baru
 * dengan kode unik berbeda dari yang sudah terlanjur ditransfer.
 */
export function OpenInvoiceCard({ invoice }: { invoice: CheckoutInvoice }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const awaitingReview = invoice.status === "AWAITING_VERIFICATION";

  function drop() {
    startTransition(async () => {
      const res = await cancelInvoiceAction(invoice.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Tagihan dibatalkan.");
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Receipt className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
            <div>
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                {awaitingReview
                  ? `Bukti transfer ${invoice.number} sedang diverifikasi`
                  : `Tagihan ${invoice.number} menunggu pembayaran`}
              </p>
              <p className="mt-0.5 text-sm text-amber-800/80 dark:text-amber-200/70">
                {invoice.planName} · transfer tepat {formatPrice(invoice.totalAmount)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={() => setOpen(true)}>
              {awaitingReview ? "Lihat tagihan" : "Bayar sekarang"}
            </Button>
            {!awaitingReview ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={drop}
                disabled={pending}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Batalkan
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <PaymentDialog
        invoice={open ? invoice : null}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) router.refresh();
        }}
      />
    </>
  );
}
