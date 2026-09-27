import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  CreditCard,
  XCircle,
} from "lucide-react";
import type { PaymentStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { MetaEventTracker } from "@/components/site/meta-event-tracker";
import { MEMBERSHIP_LEVEL_LABEL } from "@/lib/labels";
import type { MetaCustomData } from "@/lib/meta-capi";
import { publicSiteHref } from "@/lib/public-url";
import { formatPrice } from "@/lib/utils";
import { DEFAULT_AD_CURRENCY } from "@/lib/ad-catalog";

type PaymentView = {
  id: string;
  status: PaymentStatus;
  amount: number;
  kind: "ORDER" | "ENROLLMENT" | "MEMBERSHIP";
  description: string | null;
  midtransOrderId: string;
  workspace: { id: string; name: string; slug: string };
  order: { orderNumber: string } | null;
  enrollment: {
    id: string;
    course: {
      id: string;
      title: string;
      requiredLevel: keyof typeof MEMBERSHIP_LEVEL_LABEL;
      isFree: boolean;
      price: number;
    };
  } | null;
  customerMembership: {
    id: string;
    plan: {
      id: string;
      name: string;
      level: keyof typeof MEMBERSHIP_LEVEL_LABEL;
      price: number;
    };
  } | null;
};

const PRESENTATION: Record<
  "paid" | "pending" | "failed",
  { icon: typeof CheckCircle2; ring: string; title: string; blurb: string }
> = {
  paid: {
    icon: CheckCircle2,
    ring: "bg-emerald-100 text-emerald-600",
    title: "Payment successful",
    blurb: "Thank you — your payment has been confirmed.",
  },
  pending: {
    icon: Clock,
    ring: "bg-amber-100 text-amber-600",
    title: "Payment pending",
    blurb:
      "We're waiting for your payment to clear. This page updates once it does.",
  },
  failed: {
    icon: XCircle,
    ring: "bg-red-100 text-red-600",
    title: "Payment not completed",
    blurb: "The payment didn't go through. You can try again from the store.",
  },
};

function bucket(status: PaymentStatus): "paid" | "pending" | "failed" {
  if (status === "PAID") return "paid";
  if (status === "PENDING") return "pending";
  return "failed";
}

export function PaymentStatusView({
  payment,
  accessToken,
}: {
  payment: PaymentView;
  accessToken?: string;
}) {
  const view = PRESENTATION[bucket(payment.status)];
  const Icon = view.icon;
  const isPaid = payment.status === "PAID";
  const wsHome = publicSiteHref(payment.workspace.slug);
  const purchaseMetaData = isPaid ? buildPurchaseMetaData(payment) : null;
  const purchaseEventId = purchaseMetaData
    ? payment.kind === "ENROLLMENT"
      ? `purchase:enrollment:${payment.id}`
      : `purchase:membership:${payment.id}`
    : null;
  const registrationEventId =
    isPaid && payment.kind === "ENROLLMENT" && payment.enrollment
      ? `complete_registration:enrollment:${payment.enrollment.id}`
      : isPaid && payment.kind === "MEMBERSHIP" && payment.customerMembership
        ? `complete_registration:membership:${payment.customerMembership.id}`
        : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 py-14">
      {purchaseMetaData && purchaseEventId ? (
        <MetaEventTracker
          workspaceId={payment.workspace.id}
          eventName="Purchase"
          eventId={purchaseEventId}
          dedupeKey={purchaseEventId}
          customData={purchaseMetaData}
          sendServer={false}
        />
      ) : null}
      {purchaseMetaData && registrationEventId ? (
        <MetaEventTracker
          workspaceId={payment.workspace.id}
          eventName="CompleteRegistration"
          eventId={registrationEventId}
          dedupeKey={registrationEventId}
          customData={purchaseMetaData}
          sendServer={false}
        />
      ) : null}
      <div className="w-full max-w-md text-center">
        <div
          className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${view.ring}`}
        >
          <Icon className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          {view.title}
        </h1>
        <p className="mt-1.5 text-sm text-zinc-500">{view.blurb}</p>

        <div className="mt-6 rounded-xl border border-zinc-200 p-4 text-left text-sm">
          <Row label="Reference" value={payment.midtransOrderId} mono />
          {payment.description ? (
            <Row label="Item" value={payment.description} />
          ) : null}
          <Row label="Amount" value={formatPrice(payment.amount)} />
          <Row
            label="Status"
            value={
              payment.status.charAt(0) + payment.status.slice(1).toLowerCase()
            }
          />
        </div>

        <div className="mt-6 flex justify-center gap-2">
          {!isPaid && payment.status === "PENDING" && accessToken ? (
            <Button asChild>
              <Link
                href={`/payment/resume?ref=${encodeURIComponent(
                  payment.midtransOrderId
                )}&access=${encodeURIComponent(accessToken)}`}
              >
                <CreditCard className="h-4 w-4" />
                Complete payment
              </Link>
            </Button>
          ) : null}
          {isPaid && payment.kind === "ENROLLMENT" && payment.enrollment ? (
            <Button asChild>
              <Link href={`/learn/${payment.enrollment.id}`}>
                Start learning
              </Link>
            </Button>
          ) : null}
          {isPaid && payment.kind === "MEMBERSHIP" ? (
            <Button asChild>
              <Link href={wsHome}>Go to {payment.workspace.name}</Link>
            </Button>
          ) : null}
          {payment.kind === "ORDER" ? (
            <Button asChild variant={isPaid ? "default" : "outline"}>
              <Link href={publicSiteHref(payment.workspace.slug, "products")}>
                Continue shopping
              </Link>
            </Button>
          ) : null}
          {!isPaid ? (
            <Button asChild variant="outline">
              <Link href={wsHome}>Back to site</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function buildPurchaseMetaData(payment: PaymentView): MetaCustomData | null {
  if (payment.kind === "ENROLLMENT" && payment.enrollment) {
    const course = payment.enrollment.course;
    const itemPrice = course.isFree ? 0 : course.price;
    return {
      content_ids: [course.id],
      content_name: course.title,
      content_type: "course",
      content_category: MEMBERSHIP_LEVEL_LABEL[course.requiredLevel],
      contents: [{ id: course.id, quantity: 1, item_price: itemPrice }],
      currency: DEFAULT_AD_CURRENCY,
      value: payment.amount,
      num_items: 1,
      order_id: payment.midtransOrderId,
      status: "active",
    };
  }
  if (payment.kind === "MEMBERSHIP" && payment.customerMembership) {
    const plan = payment.customerMembership.plan;
    return {
      content_ids: [plan.id],
      content_name: plan.name,
      content_type: "membership",
      content_category: MEMBERSHIP_LEVEL_LABEL[plan.level],
      contents: [{ id: plan.id, quantity: 1, item_price: plan.price }],
      currency: DEFAULT_AD_CURRENCY,
      value: payment.amount,
      num_items: 1,
      order_id: payment.midtransOrderId,
      status: "active",
    };
  }
  return null;
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-zinc-500">{label}</span>
      <span
        className={`text-zinc-900 ${mono ? "font-mono text-xs" : "font-medium"}`}
      >
        {value}
      </span>
    </div>
  );
}
