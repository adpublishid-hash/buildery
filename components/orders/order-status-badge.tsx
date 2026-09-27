import type { OrderStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";

const VARIANT: Record<
  OrderStatus,
  "default" | "secondary" | "success" | "outline"
> = {
  PENDING: "secondary",
  PAID: "default",
  PROCESSING: "default",
  COMPLETED: "success",
  CANCELLED: "outline",
  FAILED: "outline",
  EXPIRED: "outline",
  // Statuses the production database still carries from the earlier lineage.
  PARTIALLY_REFUNDED: "secondary",
  REFUNDED: "outline",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant={VARIANT[status]}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}
