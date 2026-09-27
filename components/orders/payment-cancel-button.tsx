"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { cancelOrderProviderPaymentAction } from "@/lib/actions/order";
import { Button } from "@/components/ui/button";

type Props = {
  orderId: string;
  disabled?: boolean;
};

export function PaymentCancelButton({ orderId, disabled }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function cancelPayment() {
    const confirmed = window.confirm(
      "Batalkan transaksi ini di Midtrans dan tandai order sebagai cancelled?"
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await cancelOrderProviderPaymentAction(orderId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Midtrans transaction cancelled");
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={cancelPayment}
      disabled={disabled || pending}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Ban className="h-4 w-4" />
      )}
      Cancel Midtrans
    </Button>
  );
}
