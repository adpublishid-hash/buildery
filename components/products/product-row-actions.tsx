"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProductStatus } from "@prisma/client";
import { MoreHorizontal, PenSquare, Trash2 } from "lucide-react";
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
  deleteProductAction,
  setProductStatusAction,
} from "@/lib/actions/product";

type Props = {
  productId: string;
  productName: string;
  status: ProductStatus;
};

const STATUS_LABEL: Record<ProductStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

export function ProductRowActions({ productId, productName, status }: Props) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function changeStatus(next: ProductStatus) {
    startTransition(async () => {
      const res = await setProductStatusAction(productId, next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Marked as ${STATUS_LABEL[next].toLowerCase()}`);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteProductAction(productId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Product deleted");
      setConfirmOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Product actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/products/${productId}/edit`}>
              <PenSquare /> Edit
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {(["ACTIVE", "DRAFT", "ARCHIVED"] as ProductStatus[])
            .filter((s) => s !== status)
            .map((s) => (
              <DropdownMenuItem
                key={s}
                disabled={pending}
                onSelect={(e) => {
                  e.preventDefault();
                  changeStatus(s);
                }}
              >
                Mark as {STATUS_LABEL[s].toLowerCase()}
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
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{productName}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the product. Existing orders keep their
              recorded item details.
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
