"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ui/error-state";
import { reportClientError } from "@/lib/report-client-error";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard error]", error);
    reportClientError("dashboard", error);
  }, [error]);

  // Inline — the dashboard shell (sidebar/topbar) stays mounted around it.
  return (
    <ErrorState
      inline
      reset={reset}
      description="This page hit an error. Try again, or head back to the overview."
    />
  );
}
