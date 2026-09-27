import Link from "next/link";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Option = { value: string; label: string };

export function AdminFilterBar({
  action,
  query,
  status,
  statusLabel = "Status",
  options = [],
  extra,
}: {
  action: string;
  query?: string;
  status?: string;
  statusLabel?: string;
  options?: Option[];
  extra?: React.ReactNode;
}) {
  return (
    <form action={action} className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
        <Input name="q" defaultValue={query} placeholder="Cari..." className="pl-9" />
      </div>
      {options.length ? (
        <select
          name="status"
          defaultValue={status ?? ""}
          aria-label={statusLabel}
          className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-700"
        >
          <option value="">Semua {statusLabel.toLowerCase()}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      ) : null}
      {extra}
      <Button type="submit" variant="outline">Terapkan</Button>
      {query || status ? (
        <Button asChild type="button" variant="ghost" size="icon" aria-label="Reset filter">
          <Link href={action}><X className="h-4 w-4" /></Link>
        </Button>
      ) : null}
    </form>
  );
}
