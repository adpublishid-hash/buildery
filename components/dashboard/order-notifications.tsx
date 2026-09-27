import Link from "next/link";
import {
  Bell,
  CheckCheck,
  Clock3,
  Mail,
  MessageCircle,
  Send,
  ShoppingBag,
  X,
} from "lucide-react";
import type {
  StoreNotificationChannel,
  StoreNotificationEvent,
  StoreNotificationStatus,
} from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clearStoreNotificationsAction } from "@/lib/actions/store-notification";
import { prisma } from "@/lib/prisma";
import { cn, formatPrice } from "@/lib/utils";

type Props = {
  workspaceId?: string | null;
};

export async function OrderNotifications({ workspaceId }: Props) {
  const [notifications, attentionCount, recentOrderCount] = workspaceId
    ? await Promise.all([
        prisma.storeNotification.findMany({
          where: {
            workspaceId,
            clearedAt: null,
            OR: [{ orderId: { not: null } }, { event: "LOW_STOCK_ALERT" }],
          },
          include: {
            customer: { select: { name: true, email: true } },
            order: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
                total: true,
                customer: { select: { name: true, email: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 8,
        }),
        prisma.storeNotification.count({
          where: {
            workspaceId,
            clearedAt: null,
            OR: [{ orderId: { not: null } }, { event: "LOW_STOCK_ALERT" }],
            status: { in: ["QUEUED", "FAILED"] },
          },
        }),
        prisma.order.count({
          where: {
            workspaceId,
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        }),
      ])
    : ([[], 0, 0] as const);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Notifikasi order"
          className="group/bell relative -m-[4px]"
        >
          <Bell
            className="origin-top transition-transform group-hover/bell:animate-kv-ring"
            strokeWidth={1.6}
          />
          {attentionCount > 0 ? (
            <span className="absolute -right-[5px] -top-[5px] flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-kv-destructive px-[4px] text-[10px] font-semibold leading-none text-white ring-2 ring-white">
              {attentionCount > 9 ? "9+" : attentionCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] p-0">
        <div className="flex items-start justify-between gap-3 p-4">
          <div>
            <DropdownMenuLabel className="p-0 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Notifikasi toko
            </DropdownMenuLabel>
            <p className="mt-1 text-xs text-zinc-500">
              Email, WhatsApp, dan Telegram dari order dan inventory.
            </p>
          </div>
          <Badge variant={attentionCount > 0 ? "destructive" : "secondary"}>
            {attentionCount > 0
              ? `${attentionCount} perlu cek`
              : `${recentOrderCount} order 24j`}
          </Badge>
        </div>
        {workspaceId && notifications.length > 0 ? (
          <div className="flex items-center gap-2 px-4 pb-3">
            {attentionCount > 0 ? (
              <form action={clearStoreNotificationsAction}>
                <input type="hidden" name="workspaceId" value={workspaceId} />
                <input type="hidden" name="scope" value="attention" />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Clear perlu cek
                </Button>
              </form>
            ) : null}
            <form action={clearStoreNotificationsAction}>
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="scope" value="all" />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-zinc-500"
              >
                Clear semua
              </Button>
            </form>
          </div>
        ) : null}
        <DropdownMenuSeparator className="m-0" />

        {!workspaceId ? (
          <EmptyNotifications message="Pilih workspace untuk melihat notifikasi toko." />
        ) : notifications.length === 0 ? (
          <EmptyNotifications message="Belum ada notifikasi toko." />
        ) : (
          <div className="max-h-[420px] overflow-y-auto p-2">
            {notifications.map((notification) => {
              const order = notification.order;
              const customer = notification.customer ?? order?.customer;
              const Icon = channelIcon(notification.channel);
              const status = statusMeta(notification.status);
              return (
                <div
                  key={notification.id}
                  className="group flex items-start gap-1 rounded-lg border border-transparent transition hover:border-zinc-200 hover:bg-zinc-50 dark:hover:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  <Link
                    href={
                      order
                        ? `/dashboard/orders/${order.id}`
                        : notification.event === "LOW_STOCK_ALERT"
                          ? "/dashboard/products"
                          : "/dashboard/orders"
                    }
                    className="block min-w-0 flex-1 p-3"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                          status.bg,
                        )}
                      >
                        <Icon className={cn("h-4 w-4", status.fg)} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                            {eventLabel(notification.event)}
                          </p>
                          <span
                            className={cn("shrink-0 text-[11px]", status.fg)}
                          >
                            {status.label}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-zinc-500">
                          {order?.orderNumber ??
                            notification.subject ??
                            "Notifikasi"}{" "}
                          ·{" "}
                          {customer?.name ??
                            customer?.email ??
                            notification.recipient}
                        </p>
                        <p className="mt-1 truncate text-xs text-zinc-400">
                          {notification.channel.toLowerCase()} ke{" "}
                          {notification.recipient}
                        </p>
                        {notification.attempts > 0 ||
                        notification.nextAttemptAt ? (
                          <p className="mt-1 truncate text-xs text-zinc-400">
                            {notification.attempts} attempt
                            {notification.attempts === 1 ? "" : "s"}
                            {notification.nextAttemptAt
                              ? ` · retry ${notification.nextAttemptAt.toLocaleString("id-ID")}`
                              : ""}
                          </p>
                        ) : null}
                        {order ? (
                          <p className="mt-2 text-xs font-medium text-zinc-700 dark:text-zinc-200">
                            {order.status.toLowerCase()} ·{" "}
                            {formatPrice(order.total)}
                          </p>
                        ) : null}
                        {notification.errorMessage ? (
                          <p className="mt-2 line-clamp-2 rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                            {notification.errorMessage}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                  <form
                    action={clearStoreNotificationsAction}
                    className="shrink-0 pr-1 pt-2"
                  >
                    <input
                      type="hidden"
                      name="workspaceId"
                      value={workspaceId}
                    />
                    <input type="hidden" name="scope" value="single" />
                    <input
                      type="hidden"
                      name="notificationId"
                      value={notification.id}
                    />
                    <button
                      type="submit"
                      aria-label="Clear notifikasi"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white hover:text-zinc-900 dark:hover:bg-zinc-950 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}

        <DropdownMenuSeparator className="m-0" />
        <div className="grid grid-cols-2 gap-2 p-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/orders">
              <ShoppingBag /> Semua order
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/dashboard/ecommerce">
              <Clock3 /> Ringkasan
            </Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EmptyNotifications({ message }: { message: string }) {
  return (
    <div className="p-6 text-center">
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400 dark:bg-zinc-900">
        <Bell className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-medium text-zinc-900 dark:text-zinc-50">
        {message}
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        Notifikasi akan muncul otomatis saat checkout dan pembayaran diproses.
      </p>
    </div>
  );
}

function channelIcon(channel: StoreNotificationChannel) {
  if (channel === "WHATSAPP") return MessageCircle;
  if (channel === "TELEGRAM") return Send;
  return Mail;
}

function eventLabel(event: StoreNotificationEvent) {
  if (event === "PAYMENT_PAID") return "Pembayaran diterima";
  if (event === "PAYMENT_CANCELLED") return "Order dibatalkan";
  if (event === "ABANDONED_CHECKOUT_REMINDER") return "Reminder checkout";
  if (event === "LOW_STOCK_ALERT") return "Alert stok rendah";
  if (event === "REFUND_REQUESTED") return "Refund dicatat";
  if (event === "REFUND_APPROVED") return "Refund disetujui";
  if (event === "REFUND_REFUNDED") return "Refund selesai";
  if (event === "REFUND_REJECTED") return "Refund ditolak";
  if (event === "REFUND_CANCELLED") return "Refund dibatalkan";
  return "Order baru";
}

function statusMeta(status: StoreNotificationStatus) {
  if (status === "SENT") {
    return {
      label: "terkirim",
      bg: "bg-zinc-900 dark:bg-zinc-100",
      fg: "text-white dark:text-zinc-900",
    };
  }
  if (status === "FAILED") {
    return {
      label: "gagal",
      bg: "bg-zinc-200 dark:bg-zinc-700",
      fg: "text-zinc-900 dark:text-zinc-100",
    };
  }
  return {
    label: "antre",
    bg: "bg-zinc-100 dark:bg-zinc-800",
    fg: "text-zinc-600 dark:text-zinc-300",
  };
}
