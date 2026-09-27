"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PageStatus } from "@prisma/client";
import {
  Eye,
  Globe,
  Home,
  MoreHorizontal,
  PenSquare,
  Settings2,
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
  deletePageAction,
  setHomePageAction,
} from "@/lib/actions/page";
import { publicSiteHref } from "@/lib/public-url";

type Props = {
  pageId: string;
  pageTitle: string;
  pageSlug: string;
  workspaceSlug: string;
  status: PageStatus;
  isHomePage: boolean;
  canEdit: boolean;
};

type PageStatusApiResult = { ok: true } | { ok: false; error: string };

export function PageRowActions({
  pageId,
  pageTitle,
  pageSlug,
  workspaceSlug,
  status,
  isHomePage,
  canEdit,
}: Props) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function changeStatus(next: PageStatus) {
    startTransition(async () => {
      let res: PageStatusApiResult;
      try {
        const response = await fetch(`/api/dashboard/pages/${pageId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        });
        const json = (await response.json().catch(() => null)) as
          | PageStatusApiResult
          | null;
        res =
          response.ok && json?.ok
            ? { ok: true }
            : {
                ok: false,
                error:
                  json && "error" in json
                    ? json.error
                    : `Request failed with status ${response.status}.`,
              };
      } catch {
        res = {
          ok: false,
          error: "Could not reach the server. Please try again.",
        };
      }

      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Page set to ${next.toLowerCase()}`);
      router.refresh();
    });
  }

  function makeHomepage() {
    startTransition(async () => {
      const res = await setHomePageAction(pageId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Homepage updated");
      router.refresh();
    });
  }

  const liveUrl =
    isHomePage || pageSlug === "home"
      ? publicSiteHref(workspaceSlug)
      : publicSiteHref(workspaceSlug, pageSlug);

  function remove() {
    startTransition(async () => {
      const res = await deletePageAction(pageId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Page deleted");
      setConfirmOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Page actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/pages/${pageId}/builder`}>
              <PenSquare /> Open builder
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/pages/${pageId}/preview`} target="_blank">
              <Eye /> Preview
            </Link>
          </DropdownMenuItem>
          {status === "PUBLISHED" && (
            <DropdownMenuItem asChild>
              <Link href={liveUrl} target="_blank">
                <Globe /> View live
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/pages/${pageId}/settings`}>
              <Settings2 /> Settings
            </Link>
          </DropdownMenuItem>

          {canEdit && (
            <>
              <DropdownMenuSeparator />
              {!isHomePage && (
                <DropdownMenuItem
                  disabled={pending || status !== "PUBLISHED"}
                  onSelect={(e) => {
                    e.preventDefault();
                    makeHomepage();
                  }}
                >
                  <Home /> Set as homepage
                </DropdownMenuItem>
              )}
              {status !== "PUBLISHED" && (
                <DropdownMenuItem
                  disabled={pending}
                  onSelect={(e) => {
                    e.preventDefault();
                    changeStatus("PUBLISHED");
                  }}
                >
                  Publish
                </DropdownMenuItem>
              )}
              {status !== "DRAFT" && (
                <DropdownMenuItem
                  disabled={pending}
                  onSelect={(e) => {
                    e.preventDefault();
                    changeStatus("DRAFT");
                  }}
                >
                  Move to draft
                </DropdownMenuItem>
              )}
              {status !== "ARCHIVED" && (
                <DropdownMenuItem
                  disabled={pending}
                  onSelect={(e) => {
                    e.preventDefault();
                    changeStatus("ARCHIVED");
                  }}
                >
                  Archive
                </DropdownMenuItem>
              )}
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
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{pageTitle}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the page and all of its blocks. This
              action cannot be undone.
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
              {pending ? "Deleting…" : "Delete page"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
