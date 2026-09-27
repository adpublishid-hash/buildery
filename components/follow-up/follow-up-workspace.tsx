"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type {
  FollowUpChannel,
  FollowUpPriority,
  FollowUpStatus,
  OrderStatus,
} from "@prisma/client";
import { CheckCircle2, Clock3, Mail, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createFollowUpAction,
  createOrderFollowUpAction,
  deleteFollowUpAction,
  updateFollowUpStatusAction,
} from "@/lib/actions/follow-up";
import { formatDate, formatPrice } from "@/lib/utils";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";

type CustomerOption = { id: string; name: string; email: string };
type OrderOption = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: number;
  customer: CustomerOption | null;
};
type Task = {
  id: string;
  title: string;
  note: string | null;
  channel: FollowUpChannel;
  priority: FollowUpPriority;
  status: FollowUpStatus;
  dueAt: Date | null;
  customer: CustomerOption | null;
  order: { id: string; orderNumber: string; total: number; status: OrderStatus } | null;
};

export function FollowUpWorkspace({
  tasks,
  orders,
  customers,
}: {
  tasks: Task[];
  orders: OrderOption[];
  customers: CustomerOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = await createFollowUpAction(formData);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Follow-up created");
      setOpen(false);
      router.refresh();
    });
  }

  function action(taskId: string, status: FollowUpStatus) {
    startTransition(async () => {
      const res = await updateFollowUpStatusAction(taskId, status);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(status === "DONE" ? "Marked done" : "Follow-up updated");
      router.refresh();
    });
  }

  function remove(taskId: string) {
    startTransition(async () => {
      const res = await deleteFollowUpAction(taskId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Follow-up deleted");
      router.refresh();
    });
  }

  function addFromOrder(orderId: string) {
    startTransition(async () => {
      const res = await createOrderFollowUpAction(orderId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Order follow-up queued");
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Follow-up tasks
          </h2>
          <p className="text-sm text-zinc-500">
            Track reminders, customer replies, and payment nudges.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          New follow-up
        </Button>
      </div>

      <div className="grid gap-3">
        {tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 px-6 py-12 text-center dark:border-zinc-800">
            <Mail className="mx-auto mb-3 h-6 w-6 text-zinc-400" />
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              No manual follow-ups yet
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Create one manually or queue one from an order below.
            </p>
          </div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {task.title}
                    </h3>
                    <PriorityBadge priority={task.priority} />
                    <StatusBadge status={task.status} />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {task.channel.toLowerCase()} · Due{" "}
                    {task.dueAt ? formatDate(task.dueAt) : "anytime"}
                  </p>
                  {task.note ? (
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                      {task.note}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
                    {task.customer ? <span>{task.customer.name}</span> : null}
                    {task.order ? (
                      <Link
                        href={`/dashboard/orders/${task.order.id}`}
                        className="font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                      >
                        {task.order.orderNumber}
                      </Link>
                    ) : null}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" disabled={pending}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => action(task.id, "DONE")}>
                      <CheckCircle2 className="h-4 w-4" />
                      Mark done
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => action(task.id, "SNOOZED")}>
                      <Clock3 className="h-4 w-4" />
                      Snooze 1 day
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => action(task.id, "OPEN")}>
                      Reopen
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => remove(task.id)}
                      className="text-red-600 focus:bg-red-50 focus:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Orders needing attention
        </h2>
        <div className="space-y-2">
          {orders.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
              No pending or processing orders.
            </p>
          ) : (
            orders.map((order) => (
              <div
                key={order.id}
                className="flex flex-col gap-3 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/orders/${order.id}`}
                      className="text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                    >
                      {order.orderNumber}
                    </Link>
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {order.customer?.name ?? "Guest"} · {formatPrice(order.total)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addFromOrder(order.id)}
                  disabled={pending}
                >
                  Queue follow-up
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New follow-up</DialogTitle>
          </DialogHeader>
          <form action={submit} className="space-y-4">
            <Field label="Title">
              <Input name="title" placeholder="Send payment reminder" required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Customer">
                <Select name="customerId">
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Order">
                <Select name="orderId">
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    {orders.map((order) => (
                      <SelectItem key={order.id} value={order.id}>
                        {order.orderNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Channel">
                <Select name="channel" defaultValue="EMAIL">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMAIL">Email</SelectItem>
                    <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                    <SelectItem value="PHONE">Phone</SelectItem>
                    <SelectItem value="MANUAL">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Priority">
                <Select name="priority" defaultValue="MEDIUM">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Due">
                <Input name="dueAt" type="datetime-local" />
              </Field>
            </div>
            <Field label="Note">
              <Textarea name="note" rows={3} placeholder="Message context..." />
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving..." : "Create follow-up"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: FollowUpPriority }) {
  if (priority === "HIGH") return <Badge variant="destructive">High</Badge>;
  if (priority === "LOW") return <Badge variant="outline">Low</Badge>;
  return <Badge variant="secondary">Medium</Badge>;
}

function StatusBadge({ status }: { status: FollowUpStatus }) {
  if (status === "DONE") return <Badge variant="success">Done</Badge>;
  if (status === "SNOOZED") return <Badge variant="outline">Snoozed</Badge>;
  return <Badge variant="secondary">Open</Badge>;
}
