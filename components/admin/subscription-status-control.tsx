"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SaaSSubscriptionStatus } from "@prisma/client";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setSubscriptionStatusAction } from "@/lib/actions/admin";

const STATUSES: SaaSSubscriptionStatus[] = [
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
  "EXPIRED",
];

function label(s: SaaSSubscriptionStatus) {
  return s
    .toLowerCase()
    .replace("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
}

export function SubscriptionStatusControl({
  subscriptionId,
  status,
}: {
  subscriptionId: string;
  status: SaaSSubscriptionStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    if (next === status) return;
    startTransition(async () => {
      const res = await setSubscriptionStatusAction(
        subscriptionId,
        next as SaaSSubscriptionStatus
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Set to ${label(next as SaaSSubscriptionStatus)}`);
      router.refresh();
    });
  }

  return (
    <Select value={status} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="h-8 w-36 text-sm">
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
