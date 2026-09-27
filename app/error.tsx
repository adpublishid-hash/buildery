"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ui/error-state";
import { reportClientError } from "@/lib/report-client-error";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error boundary]", error);
    reportClientError("root", error);
  }, [error]);

  return <ErrorState reset={reset} />;
}
