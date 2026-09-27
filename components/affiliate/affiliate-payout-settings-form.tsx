"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateMyAffiliatePayoutDetailsAction } from "@/lib/actions/affiliate";

export function AffiliatePayoutSettingsForm({ workspaceSlug, accountLabel, method }: {
  workspaceSlug: string;
  accountLabel: string;
  method: "BANK_TRANSFER" | "EWALLET" | "OTHER" | null;
}) {
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState({ method: method ?? "BANK_TRANSFER", accountLabel, details: "" });
  return <form className="space-y-4" onSubmit={(event) => {
    event.preventDefault();
    const data = new FormData();
    Object.entries(values).forEach(([key, value]) => data.set(key, value));
    startTransition(async () => {
      const result = await updateMyAffiliatePayoutDetailsAction(workspaceSlug, data);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Payout details saved");
      setValues((current) => ({ ...current, details: "" }));
    });
  }}>
    <div className="space-y-2"><Label>Method</Label><Select value={values.method} onValueChange={(method) => setValues((current) => ({ ...current, method: method as typeof current.method }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem><SelectItem value="EWALLET">E-wallet</SelectItem><SelectItem value="OTHER">Other</SelectItem></SelectContent></Select></div>
    <div className="space-y-2"><Label htmlFor="payout-label">Account label</Label><Input id="payout-label" placeholder="BCA ending 1234" value={values.accountLabel} onChange={(event) => setValues((current) => ({ ...current, accountLabel: event.target.value }))} /></div>
    <div className="space-y-2"><Label htmlFor="payout-details">Account details</Label><Input id="payout-details" type="password" autoComplete="off" placeholder="Account number and holder name" value={values.details} onChange={(event) => setValues((current) => ({ ...current, details: event.target.value }))} /><p className="text-xs text-zinc-500">Encrypted before storage. Re-enter details only when changing them.</p></div>
    <Button type="submit" disabled={pending || !values.details.trim()}>{pending ? <Loader2 className="animate-spin" /> : <Save />} Save payout details</Button>
  </form>;
}
