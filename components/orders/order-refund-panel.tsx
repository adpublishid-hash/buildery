"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RefundStatus, RefundType } from "@prisma/client";
import {
  CreditCard,
  FileText,
  Image as ImageIcon,
  Loader2,
  PackagePlus,
  ReceiptText,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

import {
  createOrderRefundAction,
  updateOrderRefundStatusAction,
} from "@/lib/actions/order";
import { formatPrice } from "@/lib/utils";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RefundStatusBadge } from "@/components/orders/refund-status-badge";

type RefundableOrderItem = {
  id: string;
  productId: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
  productType: string | null;
};

type RefundItem = {
  id: string;
  orderItemId: string;
  productId: string | null;
  quantity: number;
  restockQuantity: number;
  orderItemName: string;
  productType: string | null;
};

type RefundEvidence = {
  id: string;
  url: string;
  name: string;
  mimeType: string;
  size: number;
};

type RefundListItem = {
  id: string;
  type: RefundType;
  status: RefundStatus;
  amount: number;
  reason: string | null;
  note: string | null;
  provider: string;
  providerRefundKey: string | null;
  providerReference: string | null;
  providerStatus: string | null;
  providerRequestedAt: string | null;
  returnToStock: boolean;
  restockedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  refundedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  items: RefundItem[];
  evidence: RefundEvidence[];
};

type Props = {
  orderId: string;
  orderTotal: number;
  items: RefundableOrderItem[];
  refunds: RefundListItem[];
  canProcessProviderRefund: boolean;
  canEdit: boolean;
};

type LineState = Record<
  string,
  {
    quantity: string;
    restockQuantity: string;
  }
>;

const TYPE_OPTIONS: { value: RefundType; label: string }[] = [
  { value: "REFUND", label: "Refund" },
  { value: "RETURN", label: "Return" },
];

const STATUS_OPTIONS: { value: RefundStatus; label: string }[] = [
  { value: "REQUESTED", label: "Requested" },
  { value: "APPROVED", label: "Approved" },
  { value: "REFUNDED", label: "Refunded" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
];

const ACTIVE_STATUSES = new Set<RefundStatus>([
  "REQUESTED",
  "APPROVED",
  "REFUNDED",
]);
const CLOSED_STATUSES = new Set<RefundStatus>([
  "REJECTED",
  "REFUNDED",
  "CANCELLED",
]);

export function OrderRefundPanel({
  orderId,
  orderTotal,
  items,
  refunds,
  canProcessProviderRefund,
  canEdit,
}: Props) {
  const router = useRouter();
  const [createPending, startCreateTransition] = useTransition();
  const [updatePending, startUpdateTransition] = useTransition();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [type, setType] = useState<RefundType>("REFUND");
  const [status, setStatus] = useState<RefundStatus>("REQUESTED");
  const [amount, setAmount] = useState(String(orderTotal));
  const [returnToStock, setReturnToStock] = useState(false);
  const [processProvider, setProcessProvider] = useState(false);
  const [lineState, setLineState] = useState<LineState>(() =>
    emptyLineState(items)
  );

  const activeByItem = useMemo(() => {
    const map = new Map<string, { refunded: number; restocked: number }>();
    for (const item of items) {
      map.set(item.id, { refunded: 0, restocked: 0 });
    }
    for (const refund of refunds) {
      if (!ACTIVE_STATUSES.has(refund.status)) continue;
      for (const item of refund.items) {
        const current = map.get(item.orderItemId) ?? {
          refunded: 0,
          restocked: 0,
        };
        current.refunded += Math.max(0, item.quantity);
        current.restocked += Math.max(0, item.restockQuantity);
        map.set(item.orderItemId, current);
      }
    }
    return map;
  }, [items, refunds]);

  const payload = useMemo(
    () =>
      items
        .map((item) => {
          const line = lineState[item.id] ?? {
            quantity: "",
            restockQuantity: "",
          };
          return {
            orderItemId: item.id,
            quantity: toQuantity(line.quantity),
            restockQuantity: returnToStock
              ? toQuantity(line.restockQuantity)
              : 0,
          };
        })
        .filter((item) => item.quantity > 0 || item.restockQuantity > 0),
    [items, lineState, returnToStock]
  );

  const activeRefundAmount = refunds
    .filter((refund) => ACTIVE_STATUSES.has(refund.status))
    .reduce((sum, refund) => sum + Math.max(0, refund.amount), 0);
  const remainingAmount = Math.max(0, orderTotal - activeRefundAmount);

  function submit(formData: FormData) {
    startCreateTransition(async () => {
      const result = await createOrderRefundAction(orderId, formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Refund recorded");
      setLineState(emptyLineState(items));
      router.refresh();
    });
  }

  function updateLine(
    itemId: string,
    field: "quantity" | "restockQuantity",
    value: string
  ) {
    setLineState((current) => ({
      ...current,
      [itemId]: {
        quantity: current[itemId]?.quantity ?? "",
        restockQuantity: current[itemId]?.restockQuantity ?? "",
        [field]: value,
      },
    }));
  }

  function updateRefundStatus(
    refund: RefundListItem,
    next: RefundStatus,
    processWithProvider = false
  ) {
    if (next === refund.status) return;
    setUpdatingId(refund.id);
    startUpdateTransition(async () => {
      const formData = new FormData();
      formData.set("status", next);
      if (processWithProvider) formData.set("processProvider", "true");
      if (refund.note) formData.set("note", refund.note);
      if (refund.providerReference) {
        formData.set("providerReference", refund.providerReference);
      }
      const result = await updateOrderRefundStatusAction(refund.id, formData);
      if (!result.ok) {
        toast.error(result.error);
        setUpdatingId(null);
        return;
      }
      toast.success("Refund status updated");
      setUpdatingId(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Refunds & returns
            </CardTitle>
            <CardDescription>
              {formatPrice(remainingAmount)} refundable balance
            </CardDescription>
          </div>
          <div className="rounded-lg border border-zinc-200 px-3 py-2 text-right dark:border-zinc-800">
            <p className="text-xs text-zinc-500">Records</p>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {refunds.length}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <form action={submit} className="space-y-4">
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="status" value={status} />
          <input
            type="hidden"
            name="returnToStock"
            value={returnToStock ? "true" : "false"}
          />
          <input
            type="hidden"
            name="processProvider"
            value={processProvider ? "true" : "false"}
          />
          <input type="hidden" name="items" value={JSON.stringify(payload)} />

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={(value) => {
                  setType(value as RefundType);
                  if (value === "REFUND") setReturnToStock(false);
                }}
                disabled={!canEdit || createPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value as RefundStatus);
                  if (value !== "REFUNDED") setProcessProvider(false);
                }}
                disabled={!canEdit || createPending}
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
              <Label>Amount</Label>
              <Input
                name="amount"
                type="number"
                min={0}
                max={remainingAmount}
                step={1}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                disabled={!canEdit || createPending}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_1.2fr]">
            <div className="space-y-2">
              <Label>Provider reference</Label>
              <Input
                name="providerReference"
                disabled={!canEdit || createPending}
                placeholder="Refund ID, transfer note"
              />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input
                name="reason"
                disabled={!canEdit || createPending}
                placeholder="Customer request, damaged item..."
              />
            </div>
          </div>

          {canProcessProviderRefund ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="min-w-0">
                <Label htmlFor="process-midtrans-refund">
                  Process via Midtrans
                </Label>
                <p className="mt-1 text-xs text-zinc-500">
                  Sends the refund request to Midtrans using an idempotent
                  refund key.
                </p>
              </div>
              <Switch
                id="process-midtrans-refund"
                checked={processProvider}
                onCheckedChange={(checked) => {
                  setProcessProvider(checked);
                  if (checked) setStatus("REFUNDED");
                }}
                disabled={!canEdit || createPending}
              />
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="min-w-0">
              <Label htmlFor="return-to-stock">Return items to stock</Label>
              <p className="mt-1 text-xs text-zinc-500">
                Physical items will be added back after status is refunded.
              </p>
            </div>
            <Switch
              id="return-to-stock"
              checked={returnToStock}
              onCheckedChange={(checked) => {
                setReturnToStock(checked);
                if (checked) setType("RETURN");
              }}
              disabled={!canEdit || createPending}
            />
          </div>

          <div className="space-y-2">
            <Label>Items</Label>
            <div className="space-y-2">
              {items.map((item) => {
                const active = activeByItem.get(item.id) ?? {
                  refunded: 0,
                  restocked: 0,
                };
                const remainingRefund = Math.max(
                  0,
                  item.quantity - active.refunded
                );
                const remainingRestock = Math.max(
                  0,
                  item.quantity - active.restocked
                );
                const isPhysical = item.productType === "PHYSICAL";

                return (
                  <div
                    key={item.id}
                    className="grid gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800 sm:grid-cols-[1fr_100px_100px]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {item.name}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {formatPrice(item.unitPrice)} x {item.quantity} ·{" "}
                        {remainingRefund} refundable
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Refund qty</Label>
                      <Input
                        type="number"
                        min={0}
                        max={remainingRefund}
                        step={1}
                        value={lineState[item.id]?.quantity ?? ""}
                        onChange={(event) =>
                          updateLine(item.id, "quantity", event.target.value)
                        }
                        disabled={!canEdit || createPending || remainingRefund === 0}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Restock qty</Label>
                      <Input
                        type="number"
                        min={0}
                        max={remainingRestock}
                        step={1}
                        value={lineState[item.id]?.restockQuantity ?? ""}
                        onChange={(event) =>
                          updateLine(
                            item.id,
                            "restockQuantity",
                            event.target.value
                          )
                        }
                        disabled={
                          !canEdit ||
                          createPending ||
                          !returnToStock ||
                          !isPhysical ||
                          remainingRestock === 0
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Internal note</Label>
            <Textarea
              name="note"
              rows={3}
              disabled={!canEdit || createPending}
              placeholder="Resolution details..."
            />
          </div>

          <Button type="submit" disabled={!canEdit || createPending}>
            {createPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ReceiptText className="h-4 w-4" />
            )}
            Record refund
          </Button>
        </form>

        <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
            <PackagePlus className="h-4 w-4" />
            Refund history
          </div>
          {refunds.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800">
              No refunds recorded yet.
            </p>
          ) : (
            <div className="space-y-3">
              {refunds.map((refund) => {
                const providerAccepted =
                  refund.providerStatus === "refund" ||
                  refund.providerStatus === "partial_refund" ||
                  refund.providerStatus === "200" ||
                  refund.providerStatus === "201";
                const canProcessThisRefund =
                  canProcessProviderRefund &&
                  refund.amount > 0 &&
                  !providerAccepted &&
                  !CLOSED_STATUSES.has(refund.status);

                return (
                  <div
                    key={refund.id}
                    data-refund-id={refund.id}
                    className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
                  >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <RefundStatusBadge status={refund.status} />
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">
                        {formatPrice(refund.amount)}
                      </span>
                      <span className="text-xs uppercase text-zinc-500">
                        {refund.type.toLowerCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {updatingId === refund.id && updatePending ? (
                        <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                      ) : null}
                      {canProcessThisRefund ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateRefundStatus(refund, "REFUNDED", true)
                          }
                          disabled={
                            !canEdit ||
                            (updatePending && updatingId === refund.id)
                          }
                        >
                          <CreditCard className="h-4 w-4" />
                          {refund.providerRefundKey ? "Retry" : "Midtrans"}
                        </Button>
                      ) : null}
                      <Select
                        value={refund.status}
                        onValueChange={(value) =>
                          updateRefundStatus(refund, value as RefundStatus)
                        }
                        disabled={
                          !canEdit ||
                          updatePending ||
                          CLOSED_STATUSES.has(refund.status)
                        }
                      >
                        <SelectTrigger className="h-8 w-32 text-xs">
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
                  </div>

                  <div className="mt-2 space-y-1 text-xs text-zinc-500">
                    <p>{formatDateTime(refund.createdAt)}</p>
                    {refund.providerReference ? (
                      <p>Reference: {refund.providerReference}</p>
                    ) : null}
                    {refund.provider === "midtrans" ? (
                      <p>
                        Midtrans: {refund.providerStatus ?? "requested"}
                        {refund.providerRefundKey
                          ? ` · ${refund.providerRefundKey}`
                          : ""}
                        {refund.providerRequestedAt
                          ? ` · ${formatDateTime(refund.providerRequestedAt)}`
                          : ""}
                      </p>
                    ) : null}
                    {refund.reason ? <p>Reason: {refund.reason}</p> : null}
                    {refund.note ? (
                      <p className="whitespace-pre-line">Note: {refund.note}</p>
                    ) : null}
                    {refund.returnToStock ? (
                      <p>
                        {refund.restockedAt
                          ? `Restocked ${formatDateTime(refund.restockedAt)}`
                          : "Restock pending"}
                      </p>
                    ) : null}
                  </div>

                  {refund.evidence.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-zinc-500">
                        Bukti dari customer
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {refund.evidence.map((file) => (
                          <a
                            className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
                            href={file.url}
                            key={file.id}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {file.mimeType === "application/pdf" ? (
                              <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                            ) : (
                              <ImageIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                            )}
                            <span className="truncate">{file.name}</span>
                            <span className="shrink-0 text-zinc-400">
                              {formatFileSize(file.size)}
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {refund.items.length > 0 ? (
                    <div className="mt-3 space-y-1.5">
                      {refund.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex flex-wrap justify-between gap-2 rounded-md bg-zinc-50 px-2.5 py-2 text-xs dark:bg-zinc-900"
                        >
                          <span className="font-medium text-zinc-700 dark:text-zinc-200">
                            {item.orderItemName}
                          </span>
                          <span className="text-zinc-500">
                            refund {item.quantity}
                            {item.restockQuantity > 0
                              ? ` · restock ${item.restockQuantity}`
                              : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function emptyLineState(items: RefundableOrderItem[]) {
  return items.reduce<LineState>((state, item) => {
    state[item.id] = { quantity: "", restockQuantity: "" };
    return state;
  }, {});
}

function toQuantity(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("id-ID");
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
