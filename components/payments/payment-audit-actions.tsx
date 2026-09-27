"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import {
  expirePaymentAction,
  reconcilePaymentAction,
  retryCancelProviderAction,
  retryRefundProviderAction,
} from "@/lib/actions/payment-audit";
import { Button } from "@/components/ui/button";

/**
 * The follow-up buttons on each Payment Audit row.
 *
 * Every action re-runs work a background job would do on its own schedule,
 * so a second press is harmless — the server re-reads state and reports why
 * when there is nothing left to do. After a success the route is refreshed
 * so the row leaves the queue (or shows its new status) without a manual
 * reload.
 */

type AuditAction = "retry-refund" | "retry-cancel" | "reconcile" | "expire";

const RUNNERS: Record<AuditAction, (id: string) => Promise<ActionOutcome>> = {
  "retry-refund": retryRefundProviderAction,
  "retry-cancel": retryCancelProviderAction,
  reconcile: reconcilePaymentAction,
  expire: expirePaymentAction,
};

type ActionOutcome = { ok: true; message: string } | { ok: false; error: string };

export function PaymentAuditAction({
  action,
  targetId,
  label,
  icon: Icon,
  variant = "outline",
}: {
  action: AuditAction;
  targetId: string;
  label: string;
  icon: LucideIcon;
  variant?: "outline" | "secondary" | "destructive";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Latched separately from `pending` so the row stays disabled through the
  // refresh that follows, not just the action call.
  const [done, setDone] = useState(false);

  function run() {
    startTransition(async () => {
      const result = await RUNNERS[action](targetId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      setDone(true);
      router.refresh();
    });
  }

  return (
    <Button
      className="h-8"
      disabled={pending || done}
      onClick={run}
      size="sm"
      type="button"
      variant={variant}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Icon className="h-3.5 w-3.5" />
      )}
      {label}
    </Button>
  );
}
