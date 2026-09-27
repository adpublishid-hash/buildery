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
import { Label } from "@/components/ui/label";
import { deleteWorkspaceAction } from "@/lib/actions/workspace";

type Props = {
  workspaceId: string;
  workspaceName: string;
};

export function DeleteWorkspaceDialog({ workspaceId, workspaceName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();

  const canConfirm = confirm.trim() === workspaceName;

  function handleDelete() {
    if (!canConfirm) return;
    startTransition(async () => {
      const res = await deleteWorkspaceAction(workspaceId, confirm.trim());
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Workspace dijadwalkan untuk dihapus dalam 30 hari");
      setOpen(false);
      router.push("/dashboard/workspaces");
      router.refresh();
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 /> Hapus workspace
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus workspace ini?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{workspaceName}</strong> akan dinonaktifkan sekarang dan
            dihapus permanen setelah 30 hari. Selama masa itu pemilik masih
            dapat memulihkannya dari daftar workspace.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="confirm">
            Ketik <span className="font-mono">{workspaceName}</span> untuk
            konfirmasi
          </Label>
          <Input
            id="confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            placeholder={workspaceName}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleDelete();
            }}
            disabled={!canConfirm || pending}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {pending ? "Menjadwalkan..." : "Jadwalkan penghapusan"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
