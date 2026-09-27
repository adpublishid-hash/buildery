import Link from "next/link";
import { FileText, Home, Plus } from "lucide-react";
import type { PageStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { getOrCreateDefaultWebsite } from "@/lib/website";
import { getPageViewCounts } from "@/lib/analytics";
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
import { PageRowActions } from "@/components/pages/page-row-actions";
import { formatDate } from "@/lib/utils";
import { Pagination, parsePage } from "@/components/ui/pagination";

export const metadata = { title: "Pages · My Landing" };

const STATUS_VARIANT: Record<
  PageStatus,
  "default" | "secondary" | "success" | "outline"
> = {
  DRAFT: "secondary",
  PUBLISHED: "success",
  ARCHIVED: "outline",
};

function statusLabel(s: PageStatus) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

const PAGE_SIZE = 50;

export default async function PagesPage({
  searchParams,
}: {
  searchParams?: { page?: string };
}) {
  const { workspace, role } = await requireCurrentWorkspace();
  const website = await getOrCreateDefaultWebsite(workspace.id);
  const canEdit = canInWorkspace(role, "content.edit");

  const page = parsePage(searchParams?.page);
  const [pages, totalPages] = await Promise.all([
    prisma.page.findMany({
      where: { websiteId: website.id },
      include: { _count: { select: { blocks: true } } },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.page.count({ where: { websiteId: website.id } }),
  ]);

  const viewCounts = await getPageViewCounts(pages.map((p) => p.id));

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Pages"
        description={`Landing pages for ${website.name}. Build, preview, and publish.`}
        action={
          canEdit ? (
            <Button asChild>
              <Link href="/dashboard/pages/new">
                <Plus /> New page
              </Link>
            </Button>
          ) : undefined
        }
      />

      {pages.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No pages yet"
          description="Create your first page and assemble it from blocks in the builder."
          action={
            canEdit ? (
              <Button asChild>
                <Link href="/dashboard/pages/new">
                  <Plus /> Create page
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
                  <TableHead className="pl-4">Page</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Blocks</TableHead>
                  <TableHead>Views</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-12 pr-4 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.map((page) => {
                  const isHomePage = website.homePageId === page.id;

                  return (
                    <TableRow key={page.id}>
                      <TableCell className="pl-4">
                        <Link
                          href={`/dashboard/pages/${page.id}/builder`}
                          className="block"
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50">
                              {page.title}
                            </span>
                            {isHomePage && (
                              <Badge variant="default" className="gap-1">
                                <Home className="h-3 w-3" /> Homepage
                              </Badge>
                            )}
                          </span>
                          <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                            {isHomePage ? "/" : `/${page.slug}`}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[page.status]}>
                          {statusLabel(page.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-zinc-500 dark:text-zinc-400">
                        {page._count.blocks}
                      </TableCell>
                      <TableCell className="text-sm text-zinc-500 dark:text-zinc-400">
                        {(viewCounts[page.id] ?? 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                        {formatDate(page.updatedAt)}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <PageRowActions
                          pageId={page.id}
                          pageTitle={page.title}
                          pageSlug={page.slug}
                          workspaceSlug={workspace.slug}
                          status={page.status}
                          isHomePage={isHomePage}
                          canEdit={canEdit}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pagination
              page={page}
              total={totalPages}
              pageSize={PAGE_SIZE}
              basePath="/dashboard/pages"
              params={{}}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
