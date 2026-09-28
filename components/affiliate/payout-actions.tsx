"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Banknote, CircleAlert, Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

type NextStatus = "PROCESSING" | "PAID" | "FAILED" | "CANCELLED";

export function PayoutStatusActions({ payoutId, status }: { payoutId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reference, setReference] = useState("");
  const [confirm, setConfirm] = useState<"FAILED" | "CANCELLED" | null>(null);
  const [note, setNote] = useState("");
  if (status === "PAID" || status === "CANCELLED" || status === "FAILED") return null;

  function update(next: NextStatus, done?: () => void) {
    const data = new FormData();
    data.set("status", next);
    data.set("reference", reference);
    if (note.trim()) data.set("note", note.trim());
    startTransition(async () => {
      const result = await updateAffiliatePayoutAction(payoutId, data);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        next === "PAID"
          ? "Payout marked paid"
          : next === "PROCESSING"
            ? "Payout is processing"
            : "Payout closed. Its commissions are back in the approved balance."
      );
      done?.();
      router.refresh();
    });
  }

  return <div className="flex min-w-[280px] items-center justify-end gap-[6px]">
    <Input
      className="h-[28px] text-[12px]"
      placeholder="Transfer reference"
      aria-label="Transfer reference"
      value={reference}
      onChange={(event) => setReference(event.target.value)}
    />
    {status === "DRAFT" ? <Button size="sm" variant="outline" onClick={() => update("PROCESSING")} disabled={pending}>Process</Button> : null}
    <Button
      size="sm"
      onClick={() => update("PAID")}
      disabled={pending || !reference.trim()}
      title={reference.trim() ? undefined : "Enter the transfer reference first"}
    >
      {pending ? <Loader2 className="animate-spin" /> : null} Mark paid
    </Button>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label="More payout actions" disabled={pending}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={() => setConfirm("FAILED")}>
          <CircleAlert /> Mark failed
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setConfirm("CANCELLED")} className="text-red-600 focus:bg-red-50 focus:text-red-700">
          <Ban /> Cancel payout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => { if (!open) { setConfirm(null); setNote(""); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm === "FAILED" ? "Mark this payout as failed?" : "Cancel this payout?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {confirm === "FAILED"
              ? "Use this when the transfer bounced. The commissions return to the approved balance so you can create a new payout."
              : "The batch is closed and its commissions return to the approved balance. This can't be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          rows={2}
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={confirm === "FAILED" ? "What went wrong? (optional)" : "Reason (optional)"}
          aria-label="Note"
        />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Back</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            className="bg-red-600 text-white hover:bg-red-700"
            onClick={(event) => {
              event.preventDefault();
              if (confirm) update(confirm, () => { setConfirm(null); setNote(""); });
            }}
          >
            {pending ? "Saving…" : confirm === "FAILED" ? "Mark failed" : "Cancel payout"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
