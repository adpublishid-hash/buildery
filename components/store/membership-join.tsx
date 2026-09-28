"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MembershipPlan } from "@prisma/client";
import { Check, Clock3, Loader2, Star, UserCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { purchaseMembershipAction } from "@/lib/actions/purchase";
import { trackMetaEvent } from "@/lib/meta-client";
import { startPayment } from "@/lib/payment-client";
import { MEMBERSHIP_LEVEL_LABEL } from "@/lib/labels";
import { formatPrice } from "@/lib/utils";
import { publicSiteHref } from "@/lib/public-url";
import type { MemberSession } from "@/lib/member-auth";

type Plan = Pick<
  MembershipPlan,
  "id" | "name" | "description" | "level" | "price" | "accessDays" | "benefits" | "recommended" | "ctaLabel"
> & { slug?: string };

export function MembershipJoin({
  workspaceId,
  workspaceSlug,
  plans,
  member,
  memberships,
}: {
  workspaceId: string;
  workspaceSlug: string;
  plans: Plan[];
  member: MemberSession | null;
  memberships: Array<{
    planId: string;
    status: string;
    expiresAt: Date | null;
    cancelAtPeriodEnd: boolean;
  }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Plan | null>(null);
  const [form, setForm] = useState({ name: "", email: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  function open(plan: Plan) {
    setSelected(plan);
    setForm({ name: member?.name ?? "", email: member?.email ?? "" });
    setErrors({});
    setServerError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setErrors({});
    setServerError(null);
    const fd = new FormData();
    fd.set("name", form.name);
    fd.set("email", form.email);
    fd.set("planId", selected.id);

    startTransition(async () => {
      const res = await purchaseMembershipAction(workspaceSlug, fd);
      if (!res.ok) {
        setServerError(res.error);
        if (res.fieldErrors) {
          const flat: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.fieldErrors)) {
            if (v?.[0]) flat[k] = v[0];
          }
          setErrors(flat);
        }
        return;
      }
      const data = res.data!;
      if (data.metaEvent) {
        trackMetaEvent({
          workspaceId,
          eventName: data.metaEvent.eventName,
          eventId: data.metaEvent.eventId,
          customData: data.metaEvent.customData,
          sendServer: false,
        });
      }
      if (data.mode !== "payment") {
        toast.success(data.mode === "renewed" ? "Access extended" : "Access activated");
        setSelected(null);
        router.refresh();
        return;
      }
      const payment = await startPayment(
        data.paymentId,
        data.paymentAccessToken
      );
      if (!payment.ok) {
        setServerError(payment.error);
        return;
      }
      window.location.href = payment.url;
    });
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const current = memberships.find((item) => item.planId === plan.id);
          const active = current?.status === "ACTIVE" && (!current.expiresAt || current.expiresAt > new Date());
          const lifetime = active && current?.expiresAt === null;
          const benefits = Array.isArray(plan.benefits)
            ? plan.benefits.filter((item): item is string => typeof item === "string")
            : [];
          return (
          <Card
            key={plan.id}
            id={plan.slug ? `plan-${plan.slug}` : undefined}
            className={plan.recommended ? "flex scroll-mt-24 flex-col border-zinc-900" : "flex scroll-mt-24 flex-col"}
          >
            <CardHeader className="space-y-2 pb-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium uppercase text-zinc-600">{MEMBERSHIP_LEVEL_LABEL[plan.level]}</span>
                {plan.recommended ? <span className="inline-flex items-center gap-1 text-xs font-medium"><Star className="h-3.5 w-3.5" /> Recommended</span> : null}
              </div>
              <CardTitle className="text-base">{plan.name}</CardTitle>
              <p className="text-2xl font-semibold text-zinc-900">
                {plan.price === 0 ? "Free" : formatPrice(plan.price)}
              </p>
              <p className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                <Clock3 className="h-3.5 w-3.5" />
                {plan.accessDays === 0 ? "Lifetime access" : `${plan.accessDays} days access`}
              </p>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <p className="text-sm text-zinc-500">
                {plan.description ?? "Membership access."}
              </p>
              {benefits.length ? <ul className="flex-1 space-y-2 text-sm text-zinc-700">{benefits.map((benefit) => <li key={benefit} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0" /> <span>{benefit}</span></li>)}</ul> : <div className="flex-1" />}
              {member ? (
                <Button onClick={() => open(plan)} className="w-full" disabled={lifetime}>
                  {lifetime ? "Current access" : active ? "Renew access" : plan.ctaLabel || (plan.price === 0 ? "Join free" : "Buy access")}
                </Button>
              ) : (
                <Button asChild className="w-full">
                  <Link
                    href={`${publicSiteHref(
                      workspaceSlug,
                      "member/register"
                    )}?callbackUrl=${encodeURIComponent(
                      publicSiteHref(workspaceSlug, "memberships")
                    )}`}
                  >
                    Sign up to join
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        );})}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Join {selected?.name}</DialogTitle>
            <DialogDescription>
              {member
                ? `Continue as ${member.email}.`
                : selected && selected.price > 0
                  ? `You'll be redirected to pay ${formatPrice(selected.price)}.`
                  : "Enter your details to activate your free membership."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {member ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                  <UserCircle className="h-4 w-4 text-zinc-500" />
                  {member.name}
                </div>
                <p className="mt-1 text-xs text-zinc-500">{member.email}</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="mj-name">Full name</Label>
                  <Input
                    id="mj-name"
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                  {errors.name && (
                    <p className="text-xs text-red-600">{errors.name}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mj-email">Email</Label>
                  <Input
                    id="mj-email"
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                  />
                  {errors.email && (
                    <p className="text-xs text-red-600">{errors.email}</p>
                  )}
                </div>
              </>
            )}
            {serverError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {serverError}
              </div>
            )}
            {!member ? (
              <p className="text-xs text-zinc-500">
                Have a member account?{" "}
                <Link
                  href={publicSiteHref(workspaceSlug, "member/login")}
                  className="font-medium text-zinc-900 hover:underline"
                >
                  Log in first
                </Link>
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSelected(null)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Check />}
                {selected && selected.price > 0 ? "Continue to payment" : "Join"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
