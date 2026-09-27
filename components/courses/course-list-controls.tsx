"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Props = {
  query: string;
  status: string;
};

const STATUS_OPTIONS = [
  { value: "ALL", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ARCHIVED", label: "Archived" },
];

export function CourseListControls({ query, status }: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const currentSearch = searchParams?.toString() ?? "";
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(query);

  useEffect(() => {
    setValue(query);
  }, [query]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams(currentSearch);
      if (value.trim()) params.set("q", value.trim());
      else params.delete("q");
      const next = params.toString();
      if (next === currentSearch) return;
      startTransition(() => {
        router.replace(next ? `${pathname}?${next}` : pathname);
      });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [currentSearch, pathname, router, value]);

  function setStatus(nextStatus: string) {
    const params = new URLSearchParams(currentSearch);
    if (nextStatus === "ALL") params.delete("status");
    else params.set("status", nextStatus);
    const next = params.toString();
    if (next === currentSearch) return;
    startTransition(() => {
      router.replace(next ? `${pathname}?${next}` : pathname);
    });
  }

  function clear() {
    setValue("");
    startTransition(() => router.replace(pathname));
  }

  const hasFilters = Boolean(query) || status !== "ALL";

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-2 sm:flex-row sm:items-center",
        pending && "opacity-70"
      )}
    >
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <Input
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          placeholder="Search courses..."
          className="pl-9"
        />
      </div>
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="ghost"
        disabled={!hasFilters}
        onClick={clear}
        className="justify-center sm:w-24"
      >
        <X className="h-4 w-4" /> Clear
      </Button>
    </div>
  );
}
