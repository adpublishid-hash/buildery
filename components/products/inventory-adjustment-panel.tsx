"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, History, Loader2, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import type { InventoryMovementType } from "@prisma/client";

import { adjustProductStockAction } from "@/lib/actions/product";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";

export type InventoryMovementItem = {
  id: string;
  type: InventoryMovementType;
  quantityChange: number;
  stockBefore: number;
  stockAfter: number;
  reason: string | null;
  createdAt: string;
};

type Props = {
  productId: string;
  currentStock: number;
  movements: InventoryMovementItem[];
};

export function InventoryAdjustmentPanel({
  productId,
  currentStock,
  movements,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [quantityChange, setQuantityChange] = useState("");
  const [reason, setReason] = useState("");
  const previewStock = useMemo(() => {
    const delta = Number(quantityChange);
    if (!Number.isFinite(delta)) return currentStock;
    return currentStock + Math.trunc(delta);
  }, [currentStock, quantityChange]);

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await adjustProductStockAction(productId, formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Stock updated to ${result.data?.stock ?? previewStock}`);
      setQuantityChange("");
      setReason("");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PackageCheck className="h-4 w-4" />
          Inventory
        </CardTitle>
        <CardDescription>
          Manual stock adjustments and recent movement history.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <form action={submit} className="space-y-4">
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-xs font-medium uppercase text-zinc-500">
              Current stock
            </p>
            <p className="mt-1 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
              {currentStock}
            </p>
            <p
              className={cn(
                "mt-1 text-xs",
                previewStock < 0 ? "text-red-600" : "text-zinc-500"
              )}
            >
              Preview: {previewStock}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Change</Label>
            <Input
              name="quantityChange"
              type="number"
              step={1}
              value={quantityChange}
              onChange={(event) => setQuantityChange(event.target.value)}
              placeholder="+10 or -2"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea
              name="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Restock, damaged item, warehouse correction..."
              rows={4}
            />
          </div>

          <Button type="submit" disabled={pending || previewStock < 0}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save adjustment
          </Button>
        </form>

        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
            <History className="h-4 w-4" />
            Recent movements
          </div>
          {movements.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-200 p-6 text-sm text-zinc-500 dark:border-zinc-800">
              No inventory movement recorded yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
              {movements.map((movement) => (
                <div
                  key={movement.id}
                  className="flex items-start justify-between gap-4 border-b border-zinc-100 p-4 last:border-b-0 dark:border-zinc-800"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {inventoryMovementLabel(movement.type)}
                      </Badge>
                      <span className="text-xs text-zinc-500">
                        {new Date(movement.createdAt).toLocaleString("id-ID")}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200">
                      {movement.reason || "No reason provided"}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {movement.stockBefore} to {movement.stockAfter}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "flex shrink-0 items-center gap-1 text-sm font-semibold",
                      movement.quantityChange > 0
                        ? "text-emerald-600"
                        : "text-red-600"
                    )}
                  >
                    {movement.quantityChange > 0 ? (
                      <ArrowUp className="h-4 w-4" />
                    ) : (
                      <ArrowDown className="h-4 w-4" />
                    )}
                    {movement.quantityChange > 0 ? "+" : ""}
                    {movement.quantityChange}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function inventoryMovementLabel(type: InventoryMovementType) {
  if (type === "ORDER_RESERVATION") return "Reserved at checkout";
  if (type === "ORDER_RELEASE") return "Released to stock";
  if (type === "ORDER_FULFILLMENT") return "Sold after payment";
  if (type === "ORDER_RETURN") return "Returned to stock";
  if (type === "ORDER_CANCELLATION") return "Cancelled order stock";
  return "Manual adjustment";
}
