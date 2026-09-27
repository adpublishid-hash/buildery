"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Loader2, LogOut } from "lucide-react";

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
import { cn } from "@/lib/utils";

type Props = {
  /**
   * "full" = bordered button on a light surface, "item" = compact menu row,
   * "sidebar" = quiet row for the dark sidebar.
   */
  variant?: "full" | "item" | "sidebar";
  className?: string;
};

/**
 * Sign-out control with an explicit confirmation step and a busy state —
 * so an accidental click never drops the user out of their session.
 */
export function LogoutButton({ variant = "full", className }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  function handleLogout() {
    setPending(true);
    // signOut triggers a full navigation to /login; pending shows until then.
    void signOut({ callbackUrl: "/login" });
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "group flex items-center gap-2.5 text-sm font-medium transition-colors",
            variant === "full" &&
              "w-full rounded-lg border border-zinc-200/80 bg-white px-2.5 py-2 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
            variant === "item" &&
              "w-full rounded-md px-2 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
            variant === "sidebar" &&
              "w-full rounded-md px-2 py-1.5 text-zinc-400 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600",
            className
          )}
        >
          <LogOut
            className={cn(
              "h-4 w-4 shrink-0 transition-colors",
              variant === "sidebar"
                ? "text-zinc-500 group-hover:text-white"
                : "text-zinc-400 group-hover:text-zinc-900 dark:text-zinc-500"
            )}
          />
          Keluar
        </button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Keluar dari My Landing?</AlertDialogTitle>
          <AlertDialogDescription>
            Kamu perlu masuk lagi untuk kembali ke workspace.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Tetap masuk</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleLogout();
            }}
            disabled={pending}
            className="bg-zinc-900 text-white hover:bg-zinc-700"
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Keluar...
              </>
            ) : (
              <>
                <LogOut className="h-4 w-4" />
                Keluar
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
