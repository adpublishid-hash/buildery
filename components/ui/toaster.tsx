"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            "group rounded-lg border border-zinc-200 bg-white text-zinc-900 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50",
          description: "text-zinc-500 dark:text-zinc-400 text-xs",
          actionButton:
            "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900",
          cancelButton: "bg-zinc-100 text-zinc-700",
        },
      }}
    />
  );
}
