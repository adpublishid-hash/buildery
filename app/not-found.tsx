import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 text-center dark:bg-zinc-950">
      <div className="max-w-sm space-y-3">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
          404
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Page not found
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          The page you’re looking for doesn’t exist or has been moved.
        </p>
        <div className="pt-2">
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
