"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createAffiliatePayoutAction,
  updateAffiliatePayoutAction,
} from "@/lib/actions/affiliate";

export function CreatePayoutButton({ affiliateId }: { affiliateId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <Button size="sm" onClick={() => startTransition(async () => {
    const result = await createAffiliatePayoutAction(affiliateId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Payout batch created");
    router.refresh();
  })} disabled={pending}>
    {pending ? <Loader2 className="animate-spin" /> : <Banknote />} Create payout
  </Button>;
}

export function PayoutStatusActions({ payoutId, status }: { payoutId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reference, setReference] = useState("");
  if (status === "PAID" || status === "CANCELLED") return null;
  function update(next: "PROCESSING" | "PAID" | "FAILED" | "CANCELLED") {
    const data = new FormData();
    data.set("status", next);
    data.set("reference", reference);
    startTransition(async () => {
      const result = await updateAffiliatePayoutAction(payoutId, data);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Payout marked ${next.toLowerCase()}`);
      router.refresh();
    });
  }
  return <div className="flex min-w-[250px] items-center gap-2">
    <Input className="h-8" placeholder="Payment reference" value={reference} onChange={(event) => setReference(event.target.value)} />
    {status === "DRAFT" ? <Button size="sm" variant="outline" onClick={() => update("PROCESSING")} disabled={pending}>Process</Button> : null}
    <Button size="sm" onClick={() => update("PAID")} disabled={pending || !reference.trim()}>Paid</Button>
  </div>;
}
