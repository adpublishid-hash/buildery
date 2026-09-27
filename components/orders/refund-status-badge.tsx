import type { RefundStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";

const VARIANT: Record<
  RefundStatus,
  "default" | "secondary" | "success" | "outline" | "destructive"
> = {
  REQUESTED: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
  REFUNDED: "success",
  CANCELLED: "outline",
};

const LABEL: Record<RefundStatus, string> = {
  REQUESTED: "Requested",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  REFUNDED: "Refunded",
  CANCELLED: "Cancelled",
};

export function RefundStatusBadge({ status }: { status: RefundStatus }) {
  return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}
