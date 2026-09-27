"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  applyCouponAction,
  removeCouponAction,
} from "@/lib/actions/cart";

type Props =
  | { applied: { code: string; label: string }; serverError?: null }
  | { applied: null; serverError: string | null };

export function CouponInput(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(
    props.applied ? null : props.serverError ?? null
  );

  function apply() {
    if (!code.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await applyCouponAction(code);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Coupon applied");
      setCode("");
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      await removeCouponAction();
      toast.success("Coupon removed");
      router.refresh();
    });
  }

  if (props.applied) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
        <div className="flex flex-col">
          <span className="font-mono text-sm font-medium text-emerald-900">
            {props.applied.code}
          </span>
          <span className="text-[11px] text-emerald-700">
            {props.applied.label}
          </span>
        </div>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="flex h-7 w-7 items-center justify-center rounded-md text-emerald-700 transition-colors hover:bg-emerald-100"
          aria-label="Remove coupon"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
          }}
          placeholder="Coupon code"
          autoComplete="off"
        />
        <Button
          type="button"
          onClick={apply}
          disabled={pending || !code.trim()}
          variant="outline"
        >
          {pending ? <Loader2 className="animate-spin" /> : null}
          Apply
        </Button>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
