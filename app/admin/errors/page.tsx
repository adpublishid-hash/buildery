import Link from "next/link";
import { Bug, CheckCircle2 } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";
import { setErrorEventResolvedAction } from "@/lib/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { AdminFilterBar } from "@/components/admin/admin-filter-bar";

export const metadata = { title: "Errors · Admin" };

const PAGE_SIZE = 30;

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function AdminErrorsPage({
  searchParams,
}: {
  searchParams?: { view?: string; page?: string; q?: string };
}) {
  await requireSuperAdmin();
  const view = searchParams?.view === "resolved" ? "resolved" : "open";
  const page = parsePage(searchParams?.page);
  const q = searchParams?.q?.trim() ?? "";
  const where = { resolvedAt: view === "open" ? null : { not: null }, ...(q ? { OR: [{ message: { contains: q, mode: "insensitive" as const } }, { source: { contains: q, mode: "insensitive" as const } }] } : {}) };
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [events, total, openCount, resolvedCount, last24h] = await Promise.all([
    prisma.errorEvent.findMany({
      where,
      orderBy: { lastSeenAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.errorEvent.count({ where }),
    prisma.errorEvent.count({ where: { resolvedAt: null } }),
    prisma.errorEvent.count({ where: { resolvedAt: { not: null } } }),
    prisma.errorEvent.count({ where: { resolvedAt: null, lastSeenAt: { gte: dayAgo } } }),
  ]);

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Errors"
        description={`Server and browser failures, grouped by cause. ${last24h} open ${
          last24h === 1 ? "issue" : "issues"
        } seen in the last 24 hours.`}
      />

      <AdminFilterBar action="/admin/errors" query={q} extra={view === "resolved" ? <input type="hidden" name="view" value="resolved" /> : undefined} />

      <div className="mb-4 flex gap-2">
        {(
          [
            ["open", `Open (${openCount})`],
            ["resolved", `Resolved (${resolvedCount})`],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={key === "open" ? "/admin/errors" : "/admin/errors?view=resolved"}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition",
              view === key
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon={view === "open" ? CheckCircle2 : Bug}
          title={view === "open" ? "No open errors" : "Nothing resolved yet"}
          description={
            view === "open"
              ? "Failures reported by the app will appear here, grouped by cause."
              : "Errors you mark as resolved stay here for 30 days."
          }
        />
      ) : (
        <Card>
          <CardContent className="divide-y divide-zinc-100 p-0">
            {events.map((event) => (
              <details key={event.id} className="group px-4 py-3">
                <summary className="flex cursor-pointer list-none items-start gap-3">
                  <Badge variant={event.source.startsWith("client:") ? "outline" : "secondary"}>
                    {event.count.toLocaleString()}×
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900">{event.message}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {event.source} · last {formatDateTime(event.lastSeenAt)} · first{" "}
                      {formatDateTime(event.firstSeenAt)}
                    </p>
                  </div>
                  <form action={setErrorEventResolvedAction}>
                    <input type="hidden" name="id" value={event.id} />
                    <input
                      type="hidden"
                      name="resolve"
                      value={event.resolvedAt ? "false" : "true"}
                    />
                    <Button type="submit" size="sm" variant="outline">
                      {event.resolvedAt ? "Reopen" : "Resolve"}
                    </Button>
                  </form>
                </summary>
                <div className="mt-3 space-y-2">
                  {event.context ? (
                    <pre className="overflow-x-auto rounded-md bg-zinc-50 p-3 text-xs text-zinc-700">
                      {JSON.stringify(event.context, null, 2)}
                    </pre>
                  ) : null}
                  {event.stack ? (
                    <pre className="max-h-80 overflow-auto rounded-md bg-zinc-950 p-3 text-xs text-zinc-100">
                      {event.stack}
                    </pre>
                  ) : (
                    <p className="text-xs text-zinc-500">
                      No stack trace.{" "}
                      {event.source.startsWith("client:")
                        ? "Browser reports carry a digest; search the server log for it to find the stack."
                        : null}
                    </p>
                  )}
                </div>
              </details>
            ))}
            <Pagination
              page={page}
              total={total}
              pageSize={PAGE_SIZE}
              basePath="/admin/errors"
              params={{ view: view === "resolved" ? "resolved" : undefined, q: q || undefined }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
