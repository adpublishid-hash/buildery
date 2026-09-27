import { Skeleton } from "@/components/ui/skeleton";

export default function SiteLoading() {
  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-zinc-200">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Skeleton className="h-6 w-32" />
          <div className="flex gap-4">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-12" />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-16">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-5/6" />
        <Skeleton className="mt-6 h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}
