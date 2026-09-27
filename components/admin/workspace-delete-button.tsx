"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteWorkspaceAdminAction } from "@/lib/actions/admin";

export function WorkspaceDeleteButton({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirmation, setConfirmation] = useState("");

  function remove() {
    startTransition(async () => {
      const res = await deleteWorkspaceAdminAction(workspaceId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Workspace dikarantina selama 30 hari");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Delete workspace">
          <Trash2 className="h-4 w-4 text-zinc-400" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Karantina workspace &ldquo;{workspaceName}&rdquo;?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Workspace langsung dinonaktifkan dan baru dihapus setelah 30 hari. Ketik nama workspace untuk mengonfirmasi.
          </AlertDialogDescription>
          <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={workspaceName} autoComplete="off" />
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              remove();
            }}
            disabled={pending || confirmation !== workspaceName}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {pending ? "Memproses..." : "Karantina"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
