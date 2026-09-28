"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CommissionStatus } from "@prisma/client";
import { CircleCheck, Clock3, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setCommissionStatusAction } from "@/lib/actions/affiliate";
import { formatDate } from "@/lib/utils";

export const COMMISSION_STATUS_LABEL: Record<CommissionStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  PAYOUT_SCHEDULED: "In payout",
  PAID: "Paid",
  REVERSED: "Reversed",
};

const STATUS_DOT: Record<CommissionStatus, string> = {
  PENDING: "before:bg-amber-500",
  APPROVED: "before:bg-sky-500",
  PAYOUT_SCHEDULED: "before:bg-violet-500",
  PAID: "",
  REVERSED: "before:bg-red-500",
};

export function CommissionStatusBadge({ status }: { status: CommissionStatus }) {
  return (
    <Badge variant="success" className={STATUS_DOT[status]}>
      {COMMISSION_STATUS_LABEL[status]}
    </Badge>
  );
}

export function CommissionStatusControl({
  commissionId,
  status,
  availableAt,
  canManage,
}: {
  commissionId: string;
  status: CommissionStatus;
  /** End of the refund hold; approval is blocked until then. */
  availableAt: Date | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const onHold = status === "PENDING" && availableAt && availableAt.getTime() > Date.now();

  function approve() {
    startTransition(async () => {
      const res = await setCommissionStatusAction(commissionId, "APPROVED");
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Commission approved");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-[6px]">
      <CommissionStatusBadge status={status} />
      {status === "PENDING" && onHold ? (
        <span
          className="inline-flex items-center gap-[4px] text-[11px] text-kv-muted-fg"
          title="Commissions can be approved once the refund hold ends."
        >
          <Clock3 className="h-[12px] w-[12px]" /> Hold until {formatDate(availableAt!)}
        </span>
      ) : null}
      {status === "PENDING" && !onHold && canManage ? (
        <Button size="sm" variant="outline" onClick={approve} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <CircleCheck />} Approve
        </Button>
      ) : null}
    </div>
  );
}
