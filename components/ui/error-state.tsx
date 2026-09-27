"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
  title?: string;
  description?: string;
  reset?: () => void;
  /** Compact variant for in-dashboard error.tsx (no min-h-screen). */
  inline?: boolean;
};

/** Shared presentation for route error boundaries. */
export function ErrorState({
  title = "Something went wrong",
  description = "An unexpected error occurred. You can try again — if it keeps happening, refresh the page.",
  reset,
  inline,
}: Props) {
  return (
    <div
      className={
        inline
          ? "flex min-h-[60vh] flex-col items-center justify-center px-6 text-center"
          : "flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center dark:bg-zinc-950"
      }
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
        <AlertTriangle className="h-6 w-6 text-zinc-900 dark:text-zinc-100" />
      </div>
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {title}
      </h1>
      <p className="mt-1.5 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        {description}
      </p>
      {reset ? (
        <Button onClick={reset} variant="outline" className="mt-5">
          <RotateCcw className="h-4 w-4" />
          Try again
        </Button>
      ) : null}
    </div>
  );
}
