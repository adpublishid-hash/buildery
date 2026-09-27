import Link from "next/link";
import { Eye, FilePlus2, FormInput, Inbox, Plus, Search } from "lucide-react";
import type { Prisma } from "@prisma/client";
import type { ComponentType } from "react";

import { getFormFunnels } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { FormRowActions } from "@/components/forms/form-row-actions";
import { formatDate } from "@/lib/utils";
import { Pagination, parsePage } from "@/components/ui/pagination";

export const metadata = { title: "Forms · My Landing" };

const PAGE_SIZE = 50;

export default async function FormsPage({
  searchParams,
}: {
  searchParams?: { q?: string; status?: string; page?: string };
}) {
  const { workspace, role } = await requireCurrentWorkspace();
  const canEdit = canInWorkspace(role, "content.edit");
  const q = (searchParams?.q ?? "").trim();
  const status = ["draft", "published", "closed"].includes(
    searchParams?.status ?? ""
  )
    ? searchParams!.status!
    : "";
  const where: Prisma.FormWhereInput = {
    workspaceId: workspace.id,
    ...(status ? { status: status.toUpperCase() as "DRAFT" | "PUBLISHED" | "CLOSED" } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const page = parsePage(searchParams?.page);
  const [forms, totalForms, openForms, totalSubmissions, matchingForms] = await Promise.all([
    prisma.form.findMany({
      where,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        _count: { select: { fields: true, submissions: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.form.count({ where: { workspaceId: workspace.id } }),
    prisma.form.count({ where: { workspaceId: workspace.id, status: "PUBLISHED" } }),
    prisma.formSubmission.count({ where: { workspaceId: workspace.id } }),
    prisma.form.count({ where }),
  ]);

  const funnels = await getFormFunnels(forms.map((form) => form.id));
  const totalViews = Object.values(funnels).reduce(
    (sum, funnel) => sum + funnel.views,
    0
  );

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Forms"
        description="Collect leads, signups, and feedback from public forms."
        action={
          canEdit ? (
            <Button asChild>
              <Link href="/dashboard/forms/new">
                <Plus /> New form
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <MetricCard
          icon={FormInput}
          label="Total forms"
          value={totalForms.toLocaleString()}
        />
        <MetricCard
          icon={FilePlus2}
          label="Published forms"
          value={openForms.toLocaleString()}
        />
        <MetricCard
          icon={Eye}
          label="Views"
          value={totalViews.toLocaleString()}
        />
        <MetricCard
          icon={Inbox}
          label="Submissions"
          value={totalSubmissions.toLocaleString()}
        />
      </div>

      <form className="mb-4 flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search forms..."
            className="h-9 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-zinc-100"
          />
        </div>
        <select
          name="status"
          defaultValue={status}
          className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-100"
        >
          <option value="">All status</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="closed">Closed</option>
        </select>
        <Button type="submit" variant="outline" size="sm">
          Filter
        </Button>
      </form>

      {forms.length === 0 ? (
        <EmptyState
          icon={FormInput}
          title={q || status ? "No forms match the filter" : "No forms yet"}
          description={
            q || status
              ? "Try a different search or status filter."
              : "Create a form, share the public link, and watch submissions come in."
          }
          action={
            canEdit && !q && !status ? (
              <Button asChild>
                <Link href="/dashboard/forms/new">
                  <FilePlus2 /> Create form
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Form</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Fields</TableHead>
                  <TableHead>Views</TableHead>
                  <TableHead>Submissions</TableHead>
                  <TableHead>Conversion</TableHead>
                  <TableHead>Updated</TableHead>
                  {canEdit && (
                    <TableHead className="w-12 pr-4 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {forms.map((form) => {
                  const funnel = funnels[form.id];
                  return (
                  <TableRow key={form.id}>
                    <TableCell className="pl-4">
                      <Link
                        href={`/dashboard/forms/${form.id}/edit`}
                        className="text-sm font-medium text-zinc-900 hover:underline"
                      >
                        {form.title}
                      </Link>
                      <p className="truncate text-xs text-zinc-500">
                        /{form.slug}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={form.status === "PUBLISHED" ? "success" : "secondary"}
                      >
                        {form.status === "PUBLISHED"
                          ? "Published"
                          : form.status === "CLOSED"
                            ? "Closed"
                            : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-zinc-500">
                      {form._count.fields}
                    </TableCell>
                    <TableCell className="text-sm text-zinc-500">
                      {(funnel?.views ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/dashboard/forms/${form.id}/submissions`}
                        className="text-sm text-zinc-900 hover:underline"
                      >
                        {form._count.submissions.toLocaleString()}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-zinc-500">
                      {formatConversion(funnel)}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {formatDate(form.updatedAt)}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="pr-4 text-right">
                        <FormRowActions
                          formId={form.id}
                          formTitle={form.title}
                          publishedSlug={form.publishedSlug}
                          workspaceSlug={workspace.slug}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pagination
              page={page}
              total={matchingForms}
              pageSize={PAGE_SIZE}
              basePath="/dashboard/forms"
              params={{ q: q || undefined, status: status || undefined }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Conversion is meaningless until somebody has actually looked at the form,
 * so an unseen form reads as "—" rather than a confident 0%.
 */
function formatConversion(funnel: { views: number; conversionRate: number } | undefined) {
  if (!funnel || funnel.views === 0) return "—";
  return `${(funnel.conversionRate * 100).toFixed(funnel.conversionRate >= 0.1 ? 0 : 1)}%`;
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs font-medium uppercase text-zinc-400">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
