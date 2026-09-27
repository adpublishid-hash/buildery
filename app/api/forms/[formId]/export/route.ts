import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { csvHeaderRow, csvRow } from "@/lib/forms";
import {
  iterateSubmissionIds,
  parseSubmissionStatus,
} from "@/lib/form-submission-query";
import { reportError } from "@/lib/error-reporting";

export const dynamic = "force-dynamic";

/**
 * Streams a CSV of the submissions currently in view. Workspace members only.
 *
 * Rows are fetched in batches and pushed out as they are read, so a form with
 * a hundred thousand submissions costs one batch of memory rather than the
 * whole table plus the whole rendered string. The filter comes from the same
 * query params as the submissions page, so what downloads matches what the
 * operator was looking at.
 */

const BATCH_SIZE = 500;

export async function GET(
  req: NextRequest,
  { params }: { params: { formId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await prisma.form.findUnique({
    where: { id: params.formId },
    include: { fields: { orderBy: { order: "asc" } } },
  });
  if (!form) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: form.workspaceId,
        userId: session.user.id,
      },
    },
    select: { role: true },
  });
  if (!membership || !canInWorkspace(membership.role, "content.view")) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const status = parseSubmissionStatus(
    req.nextUrl.searchParams.get("status") ?? undefined
  );
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const filter = {
    formId: form.id,
    workspaceId: form.workspaceId,
    status,
    q,
  };

  const fields = form.fields;
  const encoder = new TextEncoder();
  const batches = iterateSubmissionIds(filter, BATCH_SIZE);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Excel-friendly: a UTF-8 BOM ahead of the header so non-ASCII
      // characters import cleanly.
      controller.enqueue(encoder.encode(`\ufeff${csvHeaderRow(fields)}`));
    },
    // One batch per pull, not the whole table up front: the reader asks for
    // more only once it has drained what it has, so a slow client throttles
    // the query instead of filling the stream's internal queue.
    async pull(controller) {
      try {
        const next = await batches.next();
        if (next.done) {
          controller.close();
          return;
        }
        const submissions = await prisma.formSubmission.findMany({
          where: { id: { in: next.value } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { data: true, createdAt: true },
        });
        controller.enqueue(
          encoder.encode(
            submissions
              .map((submission) => `\r\n${csvRow(fields, submission)}`)
              .join("")
          )
        );
      } catch (error) {
        reportError("form-export stream failed", error);
        controller.error(error);
      }
    },
    async cancel() {
      // The client hung up; stop paging the database.
      await batches.return(undefined);
    },
  });

  const suffix = [status === "all" ? "" : status.toLowerCase(), q ? "filtered" : ""]
    .filter(Boolean)
    .join("-");
  const filename = `${form.slug}-submissions${suffix ? `-${suffix}` : ""}.csv`;

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
