"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MemberRole } from "@prisma/client";
import { MoreHorizontal, Trash2 } from "lucide-react";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  removeMemberAction,
  updateMemberRoleAction,
} from "@/lib/actions/members";
import { MEMBER_ROLE_LABEL } from "@/lib/permissions";

type Props = {
  workspaceId: string;
  memberId: string;
  memberName: string;
  currentRole: MemberRole;
  assignableRoles: Array<"ADMIN" | "EDITOR" | "VIEWER">;
};

export function MemberRowActions({
  workspaceId,
  memberId,
  memberName,
  currentRole,
  assignableRoles,
}: Props) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function changeRole(role: "ADMIN" | "EDITOR" | "VIEWER") {
    if (role === currentRole) return;
    const fd = new FormData();
    fd.set("memberId", memberId);
    fd.set("role", role);

    startTransition(async () => {
      const res = await updateMemberRoleAction(workspaceId, fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Peran diubah menjadi ${MEMBER_ROLE_LABEL[role]}`);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await removeMemberAction(workspaceId, memberId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${memberName} dihapus dari workspace`);
      setConfirmOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Member actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {assignableRoles.map((r) => (
            <DropdownMenuItem
              key={r}
              disabled={r === currentRole || pending}
              onSelect={(e) => {
                e.preventDefault();
                changeRole(r);
              }}
            >
              Jadikan {MEMBER_ROLE_LABEL[r]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setConfirmOpen(true);
            }}
            className="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950 dark:focus:text-red-300"
          >
            <Trash2 /> Hapus akses
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus akses {memberName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Anggota ini akan langsung kehilangan akses ke workspace. Anda
              bisa mengundangnya lagi kapan saja.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                remove();
              }}
              disabled={pending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {pending ? "Menghapus..." : "Hapus akses"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
