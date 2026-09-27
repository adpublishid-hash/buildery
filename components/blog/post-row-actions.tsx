"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BlogPostStatus } from "@prisma/client";
import {
  Archive,
  Copy,
  Globe,
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
import {
  deleteBlogPostAction,
  duplicateBlogPostAction,
  setBlogPostStatusAction,
} from "@/lib/actions/blog";
import { publicSiteHref } from "@/lib/public-url";

type Props = {
  postId: string;
  postTitle: string;
  publishedSlug: string | null;
  workspaceSlug: string;
  status: BlogPostStatus;
};

export function PostRowActions({
  postId,
  postTitle,
  publishedSlug,
  workspaceSlug,
  status,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function setStatus(next: BlogPostStatus) {
    startTransition(async () => {
      const res = await setBlogPostStatusAction(postId, next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Marked as ${next.toLowerCase()}`);
      router.refresh();
    });
  }

  function duplicate() {
    startTransition(async () => {
      const res = await duplicateBlogPostAction(postId);
      if (!res.ok || !res.data) {
        toast.error(res.ok ? "Could not duplicate post" : res.error);
        return;
      }
      toast.success("Draft copy created");
      router.push(`/dashboard/blog/${res.data.postId}/edit`);
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteBlogPostAction(postId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Post deleted");
      setConfirmOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Post actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/blog/${postId}/edit`}>
              <PenSquare /> Edit
            </Link>
          </DropdownMenuItem>
          {publishedSlug && (status === "PUBLISHED" || status === "SCHEDULED") && (
            <DropdownMenuItem asChild>
              <Link
                href={publicSiteHref(workspaceSlug, `blog/${publishedSlug}`)}
                target="_blank"
              >
                <Globe /> View live
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            disabled={pending}
            onSelect={(event) => {
              event.preventDefault();
              duplicate();
            }}
          >
            <Copy /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={pending}
            onSelect={(e) => {
              e.preventDefault();
              setStatus(status === "PUBLISHED" ? "DRAFT" : "PUBLISHED");
            }}
          >
            {status === "PUBLISHED" ? "Move to draft" : "Publish"}
          </DropdownMenuItem>
          {status !== "ARCHIVED" ? (
            <DropdownMenuItem
              disabled={pending}
              onSelect={(event) => {
                event.preventDefault();
                setStatus("ARCHIVED");
              }}
            >
              <Archive /> Archive
            </DropdownMenuItem>
          ) : null}
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
              Delete &ldquo;{postTitle}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The post will be removed permanently.
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
