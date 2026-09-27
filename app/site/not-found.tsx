import Link from "next/link";
import { Compass } from "lucide-react";

export default function SiteNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100">
        <Compass className="h-6 w-6 text-zinc-400" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
        404
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
        Page not found
      </h1>
      <p className="mt-2 max-w-sm text-sm text-zinc-500">
        This site or page doesn&apos;t exist, or it hasn&apos;t been published
        yet.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
      >
        Back to My Landing
      </Link>
    </div>
  );
}
