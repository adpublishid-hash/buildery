"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  acceptWorkspaceInvitationAction,
  declineWorkspaceInvitationAction,
} from "@/lib/actions/members";

export function InvitationDecision({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [intent, setIntent] = useState<"accept" | "decline" | null>(null);

  function decide(next: "accept" | "decline") {
    setIntent(next);
    startTransition(async () => {
      const result = next === "accept"
        ? await acceptWorkspaceInvitationAction(token)
        : await declineWorkspaceInvitationAction(token);
      if (!result.ok) {
        toast.error(result.error);
        setIntent(null);
        return;
      }
      toast.success(next === "accept" ? "Undangan diterima" : "Undangan ditolak");
      router.push(next === "accept" ? "/dashboard" : "/");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button onClick={() => decide("accept")} disabled={pending}>
        {pending && intent === "accept" ? <Loader2 className="animate-spin" /> : <Check />}
        Terima undangan
      </Button>
      <Button variant="outline" onClick={() => decide("decline")} disabled={pending}>
        {pending && intent === "decline" ? <Loader2 className="animate-spin" /> : <X />}
        Tolak
      </Button>
    </div>
  );
}
