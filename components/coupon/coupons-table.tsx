"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Coupon } from "@prisma/client";
import {
  MoreHorizontal,
  PenSquare,
  Plus,
  CopyPlus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createBulkCouponsAction, deleteCouponAction } from "@/lib/actions/coupon";
import { formatDate, formatPrice } from "@/lib/utils";

import {
  CouponDialog,
  type CouponDialogValues,
} from "./coupon-dialog";

function rowDefaults(c: Coupon): CouponDialogValues {
  return {
    code: c.code,
    type: c.type,
    stackingMode: c.stackingMode,
    value: String(c.value),
    maxUses: c.maxUses != null ? String(c.maxUses) : "",
    maxUsesPerCustomer: c.maxUsesPerCustomer != null ? String(c.maxUsesPerCustomer) : "",
    minimumPurchase: String(c.minimumPurchase),
    startsAt: c.startsAt ? c.startsAt.toISOString().slice(0, 10) : "",
    expiresAt: c.expiresAt ? c.expiresAt.toISOString().slice(0, 10) : "",
    firstOrderOnly: c.firstOrderOnly,
    freeShipping: c.freeShipping,
    isActive: c.isActive ? "true" : "false",
    customerId: c.customerId ?? "",
    productIds: c.productIds,
    courseIds: c.courseIds,
  };
}

function emptyDefaults(): CouponDialogValues {
  return {
    code: "",
    type: "PERCENTAGE",
    stackingMode: "ADDITIVE",
    value: "10",
    maxUses: "",
    maxUsesPerCustomer: "",
    minimumPurchase: "0",
    startsAt: "",
    expiresAt: "",
    firstOrderOnly: false,
    freeShipping: false,
    isActive: "true",
    customerId: "",
    productIds: [],
    courseIds: [],
  };
}

export function CouponsTable({
  coupons,
  customers = [],
  products = [],
  courses = [],
}: {
  coupons: Coupon[];
  customers?: { id: string; name: string; email: string }[];
  products?: { id: string; name: string; price: number }[];
  courses?: { id: string; title: string; price: number }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [dialog, setDialog] = useState<{
    open: boolean;
    mode: "create" | "edit";
    couponId?: string;
    defaultValues: CouponDialogValues;
  }>({ open: false, mode: "create", defaultValues: emptyDefaults() });

  const [confirmDelete, setConfirmDelete] = useState<Coupon | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  function remove() {
    if (!confirmDelete) return;
    startTransition(async () => {
      const res = await deleteCouponAction(confirmDelete.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Coupon deleted");
      setConfirmDelete(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex justify-end gap-2 pb-3">
        <Button variant="outline" onClick={() => setBulkOpen(true)}>
          <CopyPlus className="h-4 w-4" />
          Bulk coupons
        </Button>
        <Button
          onClick={() =>
            setDialog({
              open: true,
              mode: "create",
              defaultValues: emptyDefaults(),
            })
          }
        >
          <Plus /> New coupon
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12 pr-4 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coupons.map((c) => {
              const expired = c.expiresAt
                ? c.expiresAt.getTime() < Date.now()
                : false;
              const exhausted =
                c.maxUses != null && c.uses >= c.maxUses;
              const customer = c.customerId
                ? customers.find((item) => item.id === c.customerId)
                : null;
              const scopedProducts = c.productIds
                .map((id) => products.find((item) => item.id === id)?.name)
                .filter(Boolean) as string[];
              return (
                <TableRow key={c.id}>
                  <TableCell className="pl-4">
                    <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs font-medium text-zinc-900">
                      {c.code}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-zinc-700">
                    {c.type === "PERCENTAGE"
                      ? `${c.value}%`
                      : formatPrice(c.value)}
                    <p className="mt-1 text-xs text-zinc-400">
                      {c.stackingMode === "OVERRIDE" ? "Override" : "Additive"}
                    </p>
                  </TableCell>
                  <TableCell className="max-w-[14rem] text-xs text-zinc-500">
                    <p className="truncate">
                      {customer ? customer.name : "All customers"}
                    </p>
                    <p className="truncate">
                      {scopedProducts.length
                        ? scopedProducts.join(", ")
                        : "All products"}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm text-zinc-500">
                    {c.uses}
                    {c.maxUses != null ? ` / ${c.maxUses}` : ""}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500">
                    {c.expiresAt ? formatDate(c.expiresAt) : "—"}
                  </TableCell>
                  <TableCell>
                    {!c.isActive ? (
                      <Badge variant="secondary">Inactive</Badge>
                    ) : expired ? (
                      <Badge variant="outline">Expired</Badge>
                    ) : exhausted ? (
                      <Badge variant="outline">Exhausted</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Coupon actions"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            setDialog({
                              open: true,
                              mode: "edit",
                              couponId: c.id,
                              defaultValues: rowDefaults(c),
                            });
                          }}
                        >
                          <PenSquare /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            setConfirmDelete(c);
                          }}
                          className="text-red-600 focus:bg-red-50 focus:text-red-700"
                        >
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <CouponDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        mode={dialog.mode}
        couponId={dialog.couponId}
        defaultValues={dialog.defaultValues}
        customers={customers}
        products={products}
        courses={courses}
      />

      <BulkCouponDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
      />

      <AlertDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete coupon &ldquo;{confirmDelete?.code}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Existing orders that used this code keep their discount. Customers
              can no longer redeem the code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                remove();
              }}
              disabled={pending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {pending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function BulkCouponDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    formData.set("code", "BULK-TEMPLATE");
    formData.set("customerId", "");
    formData.set("productIds", JSON.stringify([]));
    formData.set("stackingMode", String(formData.get("stackingMode") || "ADDITIVE"));
    formData.set("isActive", formData.get("isActive") === "on" ? "true" : "false");
    startTransition(async () => {
      const res = await createBulkCouponsAction(formData);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Bulk coupons created");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk coupons</DialogTitle>
          <DialogDescription>
            Generate many unique coupon codes with the same rules.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Prefix</Label>
              <Input name="prefix" defaultValue="DISKON" />
            </div>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input name="count" type="number" min={1} max={100} defaultValue={10} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <select name="type" className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                <option value="PERCENTAGE">Percentage</option>
                <option value="FIXED">Fixed (Rp)</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Value</Label>
              <Input name="value" type="number" min={1} defaultValue={10} />
            </div>
          </div>
          <input type="hidden" name="stackingMode" value="ADDITIVE" />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Max uses</Label>
              <Input name="maxUses" type="number" min={0} placeholder="Unlimited" />
            </div>
            <div className="space-y-2">
              <Label>Expires</Label>
              <Input name="expiresAt" type="date" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input name="isActive" type="checkbox" defaultChecked />
            Active
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Generate coupons"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
