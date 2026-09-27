"use client";

import Link from "next/link";
import { useTransition } from "react";
import type { AbandonedRecoveryStatus, OrderStatus } from "@prisma/client";
import { CheckCircle2, Clock3, MailPlus, MoreHorizontal, RotateCcw, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  queueAbandonedFollowUpAction,
  resetAbandonedRecoveryAction,
  setAbandonedRecoveryStatusAction,
} from "@/lib/actions/abandoned";
import { formatDate, formatPrice } from "@/lib/utils";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";

type Recovery = {
  status: AbandonedRecoveryStatus;
  attempts: number;
  lastContactedAt: Date | null;
  snoozedUntil: Date | null;
  recoveredAt: Date | null;
  ignoredAt: Date | null;
} | null;

type AbandonedOrder = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: number;
  createdAt: Date;
  customer: { name: string; email: string; phone: string | null } | null;
  _count: { items: number };
  abandonedRecovery: Recovery;
};

export function AbandonedWorkspace({ orders }: { orders: AbandonedOrder[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function queue(orderId: string) {
    startTransition(async () => {
      const res = await queueAbandonedFollowUpAction(orderId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Recovery follow-up queued");
      router.refresh();
    });
  }

  function setStatus(orderId: string, status: AbandonedRecoveryStatus) {
    startTransition(async () => {
      const res = await setAbandonedRecoveryStatusAction(orderId, status);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Recovery updated");
      router.refresh();
    });
  }

  function reset(orderId: string) {
    startTransition(async () => {
      const res = await resetAbandonedRecoveryAction(orderId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Recovery reopened");
      router.refresh();
    });
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 px-6 py-16 text-center dark:border-zinc-800">
        <Clock3 className="mx-auto mb-3 h-7 w-7 text-zinc-400" />
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          No abandoned checkouts
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          Older pending orders will appear here once there is something to recover.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => {
        const recovery = order.abandonedRecovery;
        const status = recovery?.status ?? "OPEN";
        return (
          <div
            key={order.id}
            className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/dashboard/orders/${order.id}`}
                    className="text-sm font-semibold text-zinc-900 hover:underline dark:text-zinc-50"
                  >
                    {order.orderNumber}
                  </Link>
                  <OrderStatusBadge status={order.status} />
                  <RecoveryBadge status={status} />
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {order._count.items} items · created {formatDate(order.createdAt)}
                </p>
                <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200">
                  {order.customer?.name ?? "Guest"}{" "}
                  <span className="text-zinc-400">{order.customer?.email ?? ""}</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
                  <span>{formatPrice(order.total)}</span>
                  <span>{recovery?.attempts ?? 0} attempts</span>
                  {recovery?.lastContactedAt ? (
                    <span>last contacted {formatDate(recovery.lastContactedAt)}</span>
                  ) : null}
                  {recovery?.snoozedUntil ? (
                    <span>snoozed until {formatDate(recovery.snoozedUntil)}</span>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => queue(order.id)}
                  disabled={pending}
                >
                  <MailPlus className="h-4 w-4" />
                  Queue follow-up
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" disabled={pending}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setStatus(order.id, "SNOOZED")}>
                      <Clock3 className="h-4 w-4" />
                      Snooze 2 days
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatus(order.id, "RECOVERED")}>
                      <CheckCircle2 className="h-4 w-4" />
                      Mark recovered
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatus(order.id, "IGNORED")}>
                      <XCircle className="h-4 w-4" />
                      Ignore
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => reset(order.id)}>
                      <RotateCcw className="h-4 w-4" />
                      Reopen
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecoveryBadge({ status }: { status: AbandonedRecoveryStatus | "OPEN" }) {
  if (status === "RECOVERED") return <Badge variant="success">Recovered</Badge>;
  if (status === "IGNORED") return <Badge variant="outline">Ignored</Badge>;
  if (status === "SNOOZED") return <Badge variant="outline">Snoozed</Badge>;
  if (status === "CONTACTED") return <Badge variant="secondary">Contacted</Badge>;
  return <Badge variant="destructive">Open</Badge>;
}
