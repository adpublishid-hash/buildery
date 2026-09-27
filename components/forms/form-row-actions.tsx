"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Copy,
  ExternalLink,
  FileDown,
  Inbox,
  MoreHorizontal,
  PenSquare,
  Trash2,
} from "lucide-react";
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
import { deleteFormAction, duplicateFormAction } from "@/lib/actions/form";
import { publicSiteHref } from "@/lib/public-url";

type Props = {
  formId: string;
  formTitle: string;
  publishedSlug: string | null;
  workspaceSlug: string;
};

export function FormRowActions({
  formId,
  formTitle,
  publishedSlug,
  workspaceSlug,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function remove() {
    startTransition(async () => {
      const res = await deleteFormAction(formId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Form deleted");
      setConfirmOpen(false);
      router.refresh();
    });
  }

  function duplicate() {
    startTransition(async () => {
      const res = await duplicateFormAction(formId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const newId = res.data?.formId;
      toast.success("Form duplicated");
      if (newId) {
        router.push(`/dashboard/forms/${newId}/edit`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Form actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/forms/${formId}/edit`}>
              <PenSquare /> Edit
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/forms/${formId}/submissions`}>
              <Inbox /> Submissions
            </Link>
          </DropdownMenuItem>
          {publishedSlug ? (
            <DropdownMenuItem asChild>
              <Link
                href={publicSiteHref(workspaceSlug, `forms/${publishedSlug}`)}
                target="_blank"
              >
                <ExternalLink /> View live
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <a href={`/api/forms/${formId}/export`}>
              <FileDown /> Export CSV
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              duplicate();
            }}
            disabled={pending}
          >
            <Copy /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setConfirmOpen(true);
            }}
            className="text-red-600 focus:bg-red-50 focus:text-red-700"
          >
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete form &ldquo;{formTitle}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              All fields and submissions will be removed permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                remove();
              }}
              disabled={pending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {pending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
