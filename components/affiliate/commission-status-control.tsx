"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CommissionStatus } from "@prisma/client";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setCommissionStatusAction } from "@/lib/actions/affiliate";

export function CommissionStatusControl({
  commissionId,
  status,
}: {
  commissionId: string;
  status: CommissionStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (status !== "PENDING") {
    return <Badge variant="outline">{status.replace("_", " ").toLowerCase()}</Badge>;
  }

  function onChange(next: string) {
    if (next === status) return;
    startTransition(async () => {
      const res = await setCommissionStatusAction(
        commissionId,
        next as CommissionStatus
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Marked ${next.toLowerCase()}`);
      router.refresh();
    });
  }

  return (
    <Select value={status} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="h-8 w-32 text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent><SelectItem value="PENDING">Pending</SelectItem><SelectItem value="APPROVED">Approved</SelectItem></SelectContent>
    </Select>
  );
}
