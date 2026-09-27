"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CourseStatus } from "@prisma/client";
import {
  Globe,
  ListTree,
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
  deleteCourseAction,
  setCourseStatusAction,
} from "@/lib/actions/course";
import { publicSiteHref } from "@/lib/public-url";

const STATUS_LABEL: Record<CourseStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

type Props = {
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  workspaceSlug: string;
  status: CourseStatus;
};

export function CourseRowActions({
  courseId,
  courseTitle,
  courseSlug,
  workspaceSlug,
  status,
}: Props) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function changeStatus(next: CourseStatus) {
    startTransition(async () => {
      const res = await setCourseStatusAction(courseId, next);
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
      const res = await deleteCourseAction(courseId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Course deleted");
      setConfirmOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Course actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/courses/${courseId}/modules`}>
              <ListTree /> Edit curriculum
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/courses/${courseId}/edit`}>
              <PenSquare /> Course details
            </Link>
          </DropdownMenuItem>
          {status === "PUBLISHED" ? (
            <DropdownMenuItem asChild>
              <Link
                href={publicSiteHref(workspaceSlug, `courses/${courseSlug}`)}
                target="_blank"
              >
                <Globe /> View live
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          {(["PUBLISHED", "DRAFT", "ARCHIVED"] as CourseStatus[])
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
              Delete &ldquo;{courseTitle}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              All modules, lessons, enrollments, and progress will be removed.
              This cannot be undone.
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
