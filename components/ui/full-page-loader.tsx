import { Loader2 } from "lucide-react";

/** Minimal centered loader for full-page route transitions. */
export function FullPageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white dark:bg-zinc-950">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
      <p className="text-xs text-zinc-400">{label}</p>
    </div>
  );
}
