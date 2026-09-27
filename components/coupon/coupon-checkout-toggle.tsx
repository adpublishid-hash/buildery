"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TicketPercent } from "lucide-react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { updateCouponCheckoutEnabledAction } from "@/lib/actions/coupon";

type Props = {
  enabled: boolean;
};

export function CouponCheckoutToggle({ enabled }: Props) {
  const router = useRouter();
  const [checked, setChecked] = useState(enabled);
  const [pending, startTransition] = useTransition();

  function update(next: boolean) {
    setChecked(next);
    startTransition(async () => {
      const res = await updateCouponCheckoutEnabledAction(next);
      if (!res.ok) {
        setChecked(!next);
        toast.error(res.error);
        return;
      }
      toast.success(next ? "Kupon aktif di checkout" : "Kupon disembunyikan");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
          <TicketPercent className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
            Aktifkan field kupon di checkout
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Jika aktif, pembeli dapat memasukkan kode kupon langsung di halaman checkout.
          </p>
        </div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={update}
        disabled={pending}
        aria-label="Aktifkan kupon di checkout"
      />
    </div>
  );
}
