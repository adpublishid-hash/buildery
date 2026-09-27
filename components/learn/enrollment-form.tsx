"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enrollAction } from "@/lib/actions/enrollment";
import { trackMetaEvent } from "@/lib/meta-client";
import { startPayment } from "@/lib/payment-client";
import { enrollmentSchema, type EnrollmentInput } from "@/lib/zod";
import type { MemberSession } from "@/lib/member-auth";

type Props = {
  workspaceId: string;
  workspaceSlug: string;
  courseSlug: string;
  submitLabel: string;
  member?: MemberSession | null;
  paid?: boolean;
  manualPaymentMethods?: Array<{ id: string; name: string; type: string }>;
};

export function EnrollmentForm({
  workspaceId,
  workspaceSlug,
  courseSlug,
  submitLabel,
  member,
  paid = false,
  manualPaymentMethods = [],
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [checkoutRequestId] = useState(() => typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<EnrollmentInput>({
    resolver: zodResolver(enrollmentSchema),
    defaultValues: { name: member?.name ?? "", email: member?.email ?? "" },
  });

  function onSubmit(values: EnrollmentInput) {
    setServerError(null);
    const fd = new FormData();
    fd.set("name", values.name);
    fd.set("email", values.email);
    fd.set("checkoutRequestId", checkoutRequestId);
    const form = document.getElementById(`enroll-${courseSlug}`) as HTMLFormElement | null;
    if (form) {
      fd.set("couponCode", String(new FormData(form).get("couponCode") ?? ""));
      fd.set("paymentMethod", String(new FormData(form).get("paymentMethod") ?? "midtrans"));
    }

    startTransition(async () => {
      const res = await enrollAction(workspaceSlug, courseSlug, fd);
      if (!res.ok) {
        setServerError(res.error);
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            if (msgs?.[0]) {
              setError(field as keyof EnrollmentInput, { message: msgs[0] });
            }
          }
        }
        return;
      }
      if (res.data!.metaEvent) {
        trackMetaEvent({
          workspaceId,
          eventName: res.data!.metaEvent.eventName,
          eventId: res.data!.metaEvent.eventId,
          customData: res.data!.metaEvent.customData,
          sendServer: false,
        });
      }
      if (res.data!.mode === "enrolled") {
        router.push(`/learn/${res.data!.enrollmentId}`);
        router.refresh();
        return;
      }
      if (res.data!.mode === "manual") {
        const query = new URLSearchParams({ payment: res.data!.paymentId, access: res.data!.paymentAccessToken });
        router.push(`/site/${workspaceSlug}/courses/${courseSlug}/payment?${query}`);
        return;
      }
      // Paid course — start the Midtrans payment.
      const payment = await startPayment(
        res.data!.paymentId,
        res.data!.paymentAccessToken
      );
      if (!payment.ok) {
        setServerError(payment.error);
        return;
      }
      window.location.href = payment.url;
    });
  }

  return (
    <form id={`enroll-${courseSlug}`} onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="enroll-name">Full name</Label>
        <Input id="enroll-name" disabled={Boolean(member)} {...register("name")} />
        {errors.name && (
          <p className="text-xs text-red-600">{errors.name.message}</p>
        )}
      </div>

      {paid ? <>
        <div className="space-y-1.5"><Label htmlFor="course-coupon">Coupon (optional)</Label><Input id="course-coupon" name="couponCode" autoCapitalize="characters" placeholder="COURSE10" /></div>
        <div className="space-y-1.5"><Label htmlFor="course-payment-method">Payment method</Label><select id="course-payment-method" name="paymentMethod" className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"><option value="midtrans">Online payment (Midtrans)</option>{manualPaymentMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select></div>
      </> : null}
      <div className="space-y-1.5">
        <Label htmlFor="enroll-email">Email</Label>
        <Input
          id="enroll-email"
          type="email"
          disabled={Boolean(member)}
          {...register("email")}
        />
        {errors.email && (
          <p className="text-xs text-red-600">{errors.email.message}</p>
        )}
      </div>

      {serverError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {serverError}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        {pending ? "Enrolling…" : submitLabel}
      </Button>
    </form>
  );
}
