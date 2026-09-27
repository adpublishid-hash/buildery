"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, MoreHorizontal, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  resendInvitationAction,
  revokeInvitationAction,
} from "@/lib/actions/members";

type Props = {
  workspaceId: string;
  invitationId: string;
};

export function InvitationRowActions({ workspaceId, invitationId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function revoke() {
    startTransition(async () => {
      const res = await revokeInvitationAction(workspaceId, invitationId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Undangan dibatalkan");
      router.refresh();
    });
  }

  function resend() {
    startTransition(async () => {
      const res = await resendInvitationAction(workspaceId, invitationId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Email undangan dikirim");
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Invitation actions"
          disabled={pending}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            resend();
          }}
        >
          <Mail /> Kirim ulang
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            revoke();
          }}
          className="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950 dark:focus:text-red-300"
        >
          <X /> Batalkan
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
