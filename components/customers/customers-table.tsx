"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, PenSquare, Plus, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import {
  createCustomerAction,
  deleteCustomerAction,
  updateCustomerAction,
} from "@/lib/actions/customer";
import { formatDate, formatPrice } from "@/lib/utils";

type CustomerRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  createdAt: Date;
  orders: { total: number; createdAt: Date }[];
  _count: { orders: number; enrollments: number; memberships: number };
};

type FormValues = { name: string; email: string; phone: string };

const EMPTY: FormValues = { name: "", email: "", phone: "" };

export function CustomersTable({ customers }: { customers: CustomerRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{
    open: boolean;
    mode: "create" | "edit";
    customerId?: string;
    values: FormValues;
  }>({ open: false, mode: "create", values: EMPTY });
  const [confirmDelete, setConfirmDelete] = useState<CustomerRow | null>(null);

  function submit(formData: FormData) {
    startTransition(async () => {
      const res =
        dialog.mode === "create"
          ? await createCustomerAction(formData)
          : await updateCustomerAction(dialog.customerId!, formData);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(dialog.mode === "create" ? "Customer added" : "Customer saved");
      setDialog({ open: false, mode: "create", values: EMPTY });
      router.refresh();
    });
  }

  function remove() {
    if (!confirmDelete) return;
    startTransition(async () => {
      const res = await deleteCustomerAction(confirmDelete.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Customer deleted");
      setConfirmDelete(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex justify-end pb-3">
        <Button
          onClick={() =>
            setDialog({ open: true, mode: "create", values: EMPTY })
          }
        >
          <Plus className="h-4 w-4" />
          Add customer
        </Button>
      </div>

      <Table className="min-w-[680px]">
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Customer</TableHead>
            <TableHead>Orders</TableHead>
            <TableHead>Learning</TableHead>
            <TableHead>Lifetime value</TableHead>
            <TableHead>Last activity</TableHead>
            <TableHead className="w-12 pr-4 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((customer) => {
            const total = customer.orders.reduce((sum, order) => sum + order.total, 0);
            return (
              <TableRow key={customer.id}>
                <TableCell className="pl-4">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {customer.name}
                  </p>
                  <p className="text-xs text-zinc-500">{customer.email}</p>
                  {customer.phone ? (
                    <p className="text-xs text-zinc-400">{customer.phone}</p>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm text-zinc-600 dark:text-zinc-300">
                  {customer._count.orders}
                </TableCell>
                <TableCell className="text-sm text-zinc-500">
                  {customer._count.enrollments + customer._count.memberships}
                </TableCell>
                <TableCell className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {formatPrice(total)}
                </TableCell>
                <TableCell className="text-xs text-zinc-500">
                  {formatDate(customer.orders[0]?.createdAt ?? customer.createdAt)}
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          setDialog({
                            open: true,
                            mode: "edit",
                            customerId: customer.id,
                            values: {
                              name: customer.name,
                              email: customer.email,
                              phone: customer.phone ?? "",
                            },
                          });
                        }}
                      >
                        <PenSquare className="h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          setConfirmDelete(customer);
                        }}
                        className="text-red-600 focus:bg-red-50 focus:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Dialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((curr) => ({ ...curr, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog.mode === "create" ? "Add customer" : "Edit customer"}
            </DialogTitle>
          </DialogHeader>
          <form action={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customer-name">Name</Label>
              <Input id="customer-name" name="name" defaultValue={dialog.values.name} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-email">Email</Label>
              <Input
                id="customer-email"
                name="email"
                type="email"
                defaultValue={dialog.values.email}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-phone">Phone</Label>
              <Input id="customer-phone" name="phone" defaultValue={dialog.values.phone} />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialog((curr) => ({ ...curr, open: false }))}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving..." : "Save customer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the customer profile. Existing orders remain in the order history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                remove();
              }}
              disabled={pending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {pending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
