"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OrderStatus } from "@prisma/client";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateOrderStatusAction } from "@/lib/actions/order";

const STATUSES: OrderStatus[] = [
  "PENDING",
  "PAID",
  "PROCESSING",
  "COMPLETED",
  "CANCELLED",
];

function label(s: OrderStatus) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

type Props = {
  orderId: string;
  status: OrderStatus;
  disabled?: boolean;
};

export function OrderStatusControl({ orderId, status, disabled }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    if (next === status) return;
    startTransition(async () => {
      const res = await updateOrderStatusAction(orderId, next as OrderStatus);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Order marked ${next.toLowerCase()}`);
      router.refresh();
    });
  }

  return (
    <Select
      value={status}
      onValueChange={onChange}
      disabled={disabled || pending}
    >
      <SelectTrigger className="h-8 w-40 text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {label(s)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
