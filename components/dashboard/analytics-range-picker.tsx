"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { RANGE_LABEL, type RangeKey } from "@/lib/analytics-range";

const KEYS: RangeKey[] = ["today", "7d", "30d", "custom"];

type Props = {
  current: RangeKey;
  from?: string;
  to?: string;
};

export function AnalyticsRangePicker({ current, from, to }: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const currentSearch = searchParams?.toString() ?? "";
  const [pending, startTransition] = useTransition();

  function pushParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(currentSearch);
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === "") params.delete(k);
      else params.set(k, v);
    }
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  function selectRange(key: RangeKey) {
    if (key === "custom") {
      pushParams({ range: "custom" });
    } else {
      pushParams({ range: key, from: null, to: null });
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div
        className={cn(
          "flex gap-1 rounded-lg border border-zinc-200 bg-white p-1",
          pending && "opacity-60"
        )}
      >
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            disabled={pending}
            onClick={() => selectRange(k)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs transition-colors",
              current === k
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:text-zinc-900"
            )}
          >
            {RANGE_LABEL[k]}
          </button>
        ))}
      </div>

      {current === "custom" ? (
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="from" className="text-[10px] uppercase tracking-wider text-zinc-400">
              Dari
            </Label>
            <Input
              id="from"
              type="date"
              defaultValue={from ?? ""}
              onChange={(e) => pushParams({ from: e.target.value })}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to" className="text-[10px] uppercase tracking-wider text-zinc-400">
              Sampai
            </Label>
            <Input
              id="to"
              type="date"
              defaultValue={to ?? ""}
              onChange={(e) => pushParams({ to: e.target.value })}
              className="h-8 text-xs"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
