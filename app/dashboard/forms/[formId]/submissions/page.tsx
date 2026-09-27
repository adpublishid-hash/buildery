import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileDown, Inbox, Search } from "lucide-react";
import type { FormSubmissionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { getFormFunnels } from "@/lib/analytics";
import {
  findSubmissionPage,
  parseSubmissionStatus,
} from "@/lib/form-submission-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  SubmissionsTable,
  type SubmissionRow,
} from "@/components/forms/submissions-table";

export const metadata = { title: "Submissions · My Landing" };

const PAGE_SIZE = 50;

const STATUS_FILTERS: Array<{
  value: FormSubmissionStatus | "all";
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "NEW", label: "New" },
  { value: "READ", label: "Read" },
  { value: "ARCHIVED", label: "Archived" },
  { value: "SPAM", label: "Spam" },
];

function parsePage(raw: string | undefined) {
  const n = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 1_000);
}

function buildQuery(
  params: Record<string, string | undefined>,
  override: Record<string, string | undefined>
): string {
  const merged = { ...params, ...override };
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value) usp.set(key, value);
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

export default async function FormSubmissionsPage({
  params,
  searchParams,
}: {
  params: { formId: string };
  searchParams?: { q?: string; status?: string; page?: string };
}) {
  const { workspace } = await requireCurrentWorkspace();
  const q = (searchParams?.q ?? "").trim();
  const status = parseSubmissionStatus(searchParams?.status);
  const page = parsePage(searchParams?.page);

  // One predicate decides everything: the page, the total, and the export.
  // It reaches inside the submission JSON, which is what the old two-stage
  // filter could not do.
  const filter = {
    formId: params.formId,
    workspaceId: workspace.id,
    status,
    q,
  };

  const [form, totalSubmissions, newCount, matched] = await Promise.all([
    prisma.form.findUnique({
      where: { id: params.formId },
      include: { fields: { orderBy: { order: "asc" } } },
    }),
    prisma.formSubmission.count({
      where: { formId: params.formId, workspaceId: workspace.id },
    }),
    prisma.formSubmission.count({
      where: {
        formId: params.formId,
        workspaceId: workspace.id,
        status: "NEW",
      },
    }),
    findSubmissionPage(filter, {
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  if (!form || form.workspaceId !== workspace.id) notFound();

  const funnel = (await getFormFunnels([form.id]))[form.id];
  const totalMatching = matched.total;
  const submissions =
    matched.ids.length > 0
      ? await prisma.formSubmission.findMany({
          where: { id: { in: matched.ids } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          include: { deliveries: { orderBy: { createdAt: "desc" } } },
        })
      : [];

  const rows: SubmissionRow[] = submissions.map((s) => ({
    id: s.id,
    createdAt: s.createdAt.toISOString(),
    status: s.status,
    notes: s.notes,
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
    referrer: s.referrer,
    data:
      s.data && typeof s.data === "object" && !Array.isArray(s.data)
        ? (s.data as Record<string, unknown>)
        : {},
    deliveries: s.deliveries.map((d) => ({
      id: d.id,
      kind: d.kind,
      status: d.status,
      target: d.target,
      attempts: d.attempts,
      lastError: d.lastError,
    })),
  }));

  const totalPages = Math.max(1, Math.ceil(totalMatching / PAGE_SIZE));
  const paramsForQuery = {
    q: q || undefined,
    status: status === "all" ? undefined : status,
  };

  return (
    <div className="w-full min-w-0">
      <Link
        href="/dashboard/forms"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to forms
      </Link>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {form.title}
          </h1>
          <p className="text-sm text-zinc-500">
            {totalSubmissions.toLocaleString()} submission
            {totalSubmissions === 1 ? "" : "s"}
            {newCount > 0 ? ` · ${newCount} new` : ""}
            {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          {/* Same filter as the table, so the download matches the view. */}
          <a href={`/api/forms/${form.id}/export${buildQuery(paramsForQuery, {})}`}>
            <FileDown />
            {q || status !== "all" ? "Export hasil filter" : "Export CSV"}
          </a>
        </Button>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-5">
        <Stat label="Total" value={totalSubmissions.toLocaleString()} />
        <Stat label="New" value={newCount.toLocaleString()} />
        <Stat label="Views" value={(funnel?.views ?? 0).toLocaleString()} />
        <Stat
          label="Conversion"
          value={
            funnel && funnel.views > 0
              ? `${(funnel.conversionRate * 100).toFixed(
                  funnel.conversionRate >= 0.1 ? 0 : 1
                )}%`
              : "—"
          }
        />
        <Stat label="Filtered" value={totalMatching.toLocaleString()} />
      </div>

      {form.multiStep && (funnel?.stepReach.length ?? 0) > 1 ? (
        <Card className="mb-4">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase text-zinc-400">
              Langkah yang dicapai
            </p>
            <div className="mt-3 space-y-2">
              {funnel!.stepReach.map((reached, index) => {
                const first = funnel!.stepReach[0] || 0;
                const share = first > 0 ? reached / first : 0;
                const dropped =
                  index > 0 ? (funnel!.stepReach[index - 1] ?? 0) - reached : 0;
                return (
                  <div key={index} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 text-xs text-zinc-500">
                      Step {index + 1}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className="h-full rounded-full bg-zinc-900"
                        style={{ width: `${Math.round(share * 100)}%` }}
                      />
                    </div>
                    <span className="w-28 shrink-0 text-right text-xs text-zinc-500">
                      {reached.toLocaleString()}
                      {dropped > 0 ? ` · −${dropped.toLocaleString()}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <form className="mb-4 flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search submissions..."
            className="h-9 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-zinc-100"
          />
        </div>
        <select
          name="status"
          defaultValue={status}
          className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-100"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">
          Filter
        </Button>
      </form>

      {submissions.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={
            q || status !== "all"
              ? "No submissions match the filter"
              : "No submissions yet"
          }
          description={
            q || status !== "all"
              ? "Try a different search or status."
              : "Share the form's public URL — entries appear here as they arrive."
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No submissions match the search on this page"
          description="Try clearing the search to look across all submissions."
        />
      ) : (
        <SubmissionsTable
          formId={form.id}
          fields={form.fields.map((f) => ({
            id: f.id,
            label: f.label,
            name: f.name,
          }))}
          submissions={rows}
        />
      )}

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-zinc-500">
            Showing {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, totalMatching)} of{" "}
            {totalMatching.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              disabled={page === 1}
            >
              <Link
                href={`/dashboard/forms/${form.id}/submissions${buildQuery(
                  paramsForQuery,
                  { page: page > 2 ? String(page - 1) : undefined }
                )}`}
              >
                ← Prev
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
            >
              <Link
                href={`/dashboard/forms/${form.id}/submissions${buildQuery(
                  paramsForQuery,
                  { page: String(page + 1) }
                )}`}
              >
                Next →
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase text-zinc-400">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-zinc-900">{value}</p>
      </CardContent>
    </Card>
  );
}
