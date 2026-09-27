import type { FulfillmentStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";

const VARIANT: Record<
  FulfillmentStatus,
  "default" | "secondary" | "success" | "outline" | "destructive"
> = {
  NOT_REQUIRED: "outline",
  UNFULFILLED: "secondary",
  PACKED: "default",
  SHIPPED: "default",
  DELIVERED: "success",
  CANCELLED: "outline",
};

const LABEL: Record<FulfillmentStatus, string> = {
  NOT_REQUIRED: "No fulfillment",
  UNFULFILLED: "Unfulfilled",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export function FulfillmentStatusBadge({
  status,
}: {
  status: FulfillmentStatus;
}) {
  return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}
