"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FulfillmentStatus } from "@prisma/client";
import { ExternalLink, Loader2, PackageCheck, Truck } from "lucide-react";
import { toast } from "sonner";

import { updateOrderFulfillmentAction } from "@/lib/actions/order";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FulfillmentStatusBadge } from "@/components/orders/fulfillment-status-badge";

type FulfillmentEventItem = {
  id: string;
  status: FulfillmentStatus;
  trackingCarrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  note: string | null;
  createdAt: string;
};

type Props = {
  orderId: string;
  status: FulfillmentStatus;
  trackingCarrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  note: string | null;
  packedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  events: FulfillmentEventItem[];
  canEdit: boolean;
};

const STATUS_OPTIONS: { value: FulfillmentStatus; label: string }[] = [
  { value: "UNFULFILLED", label: "Unfulfilled" },
  { value: "PACKED", label: "Packed" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "NOT_REQUIRED", label: "No fulfillment" },
];

export function OrderFulfillmentPanel({
  orderId,
  status,
  trackingCarrier,
  trackingNumber,
  trackingUrl,
  note,
  packedAt,
  shippedAt,
  deliveredAt,
  events,
  canEdit,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nextStatus, setNextStatus] = useState<FulfillmentStatus>(status);
  const [carrier, setCarrier] = useState(trackingCarrier ?? "");
  const [number, setNumber] = useState(trackingNumber ?? "");
  const [url, setUrl] = useState(trackingUrl ?? "");
  const [memo, setMemo] = useState(note ?? "");

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await updateOrderFulfillmentAction(orderId, formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Fulfillment updated");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Fulfillment
            </CardTitle>
            <CardDescription>
              Packing, shipping, delivery, and tracking details.
            </CardDescription>
          </div>
          <FulfillmentStatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Milestone label="Packed" value={packedAt} />
          <Milestone label="Shipped" value={shippedAt} />
          <Milestone label="Delivered" value={deliveredAt} />
        </div>

        <form action={submit} className="space-y-4">
          <input type="hidden" name="fulfillmentStatus" value={nextStatus} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={nextStatus}
                onValueChange={(value) => setNextStatus(value as FulfillmentStatus)}
                disabled={!canEdit || pending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Carrier</Label>
              <Input
                name="trackingCarrier"
                value={carrier}
                onChange={(event) => setCarrier(event.target.value)}
                disabled={!canEdit || pending}
                placeholder="JNE, SiCepat, J&T..."
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_1.4fr]">
            <div className="space-y-2">
              <Label>Tracking number</Label>
              <Input
                name="trackingNumber"
                value={number}
                onChange={(event) => setNumber(event.target.value)}
                disabled={!canEdit || pending}
                placeholder="Resi"
              />
            </div>
            <div className="space-y-2">
              <Label>Tracking URL</Label>
              <div className="flex gap-2">
                <Input
                  name="trackingUrl"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  disabled={!canEdit || pending}
                  placeholder="https://..."
                />
                {trackingUrl ? (
                  <Button type="button" variant="outline" size="icon" asChild>
                    <a href={trackingUrl} target="_blank" rel="noreferrer" aria-label="Open tracking URL">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea
              name="note"
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              disabled={!canEdit || pending}
              rows={3}
              placeholder="Packed by team, sent from warehouse, delivery note..."
            />
          </div>

          <Button type="submit" disabled={!canEdit || pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save fulfillment
          </Button>
        </form>

        <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
            <PackageCheck className="h-4 w-4" />
            Timeline
          </div>
          {events.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800">
              No fulfillment updates yet.
            </p>
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <FulfillmentStatusBadge status={event.status} />
                    <span className="text-xs text-zinc-500">
                      {new Date(event.createdAt).toLocaleString("id-ID")}
                    </span>
                  </div>
                  {event.trackingNumber || event.trackingCarrier ? (
                    <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                      {[event.trackingCarrier, event.trackingNumber]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                  {event.note ? (
                    <p className="mt-1 whitespace-pre-line text-zinc-500">
                      {event.note}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Milestone({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-50">
        {value ? new Date(value).toLocaleString("id-ID") : "—"}
      </p>
    </div>
  );
}
