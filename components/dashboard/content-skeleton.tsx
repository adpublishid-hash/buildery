import { Skeleton } from "@/components/ui/skeleton";

/**
 * Generic dashboard content placeholder shown by route-level loading.tsx
 * files while a page's data resolves. The sidebar + header stay mounted.
 * Shaped like the Kravio page: header, a row of KPI frames, one panel.
 */
export function ContentSkeleton() {
  return (
    <div className="w-full">
      {/* page header */}
      <div className="flex flex-col gap-[8px] pb-[16px]">
        <Skeleton className="h-[22px] w-[220px]" />
        <Skeleton className="h-[13px] w-[320px] max-w-full" />
      </div>

      {/* stat row */}
      <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="kv-frame flex h-[116px] flex-col p-[4px]">
            <div className="px-[8px] py-[6px]">
              <Skeleton className="h-[13px] w-[110px]" />
            </div>
            <div className="flex flex-1 flex-col justify-end gap-[8px] rounded-[10px] border-[0.8px] border-kv-border bg-kv-card px-[12px] py-[10px]">
              <Skeleton className="h-[22px] w-[80px]" />
              <Skeleton className="h-[12px] w-[140px]" />
            </div>
          </div>
        ))}
      </div>

      {/* main panel */}
      <div className="kv-frame mt-[12px] flex flex-col p-[4px]">
        <div className="px-[8px] py-[6px]">
          <Skeleton className="h-[13px] w-[160px]" />
        </div>
        <div className="flex flex-col gap-[10px] rounded-[10px] border-[0.8px] border-kv-input bg-kv-card p-[12px]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-[12px]">
              <Skeleton className="h-[28px] w-[28px] rounded-[8px]" />
              <div className="flex-1 space-y-[6px]">
                <Skeleton className="h-[12px] w-1/3" />
                <Skeleton className="h-[11px] w-1/4" />
              </div>
              <Skeleton className="h-[22px] w-[64px] rounded-[6px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
