import "server-only";

import { Prisma, type FormSubmissionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * One filter, one source of truth, for the submissions dashboard and the CSV
 * export.
 *
 * The search has to reach inside `FormSubmission.data`, which Prisma's query
 * builder cannot do on a Json column — so the predicate is assembled as SQL
 * and the matching ids are hydrated afterwards. Keeping counting, paging and
 * exporting on this one predicate is what stops the footer total and the
 * visible rows from disagreeing.
 */

export type SubmissionFilter = {
  formId: string;
  workspaceId: string;
  status: FormSubmissionStatus | "all";
  q: string;
};

export type SubmissionPage = {
  ids: string[];
  total: number;
};

/**
 * `%` and `_` are wildcards in LIKE, so a visitor searching for "100%" would
 * otherwise match every row. Escape them, and the escape character itself.
 */
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function whereSql(filter: SubmissionFilter): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`"formId" = ${filter.formId}`,
    Prisma.sql`"workspaceId" = ${filter.workspaceId}`,
  ];

  if (filter.status !== "all") {
    conditions.push(
      Prisma.sql`"status" = ${filter.status}::"FormSubmissionStatus"`
    );
  }

  const q = filter.q.trim();
  if (q) {
    const like = `%${escapeLike(q)}%`;
    // `data::text` covers every answer the visitor gave, including the field
    // keys. Matching a key is a little loose but it is never wrong, and it
    // keeps the predicate to one expression the planner can handle.
    conditions.push(Prisma.sql`(
      "data"::text ILIKE ${like} ESCAPE '\\'
      OR "notes" ILIKE ${like} ESCAPE '\\'
      OR "ipAddress" ILIKE ${like} ESCAPE '\\'
      OR "userAgent" ILIKE ${like} ESCAPE '\\'
    )`);
  }

  return Prisma.join(conditions, " AND ");
}

/** Ids for one page, newest first, plus how many match in total. */
export async function findSubmissionPage(
  filter: SubmissionFilter,
  paging: { skip: number; take: number }
): Promise<SubmissionPage> {
  const where = whereSql(filter);

  const [rows, counted] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "FormSubmission"
      WHERE ${where}
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT ${paging.take} OFFSET ${paging.skip}
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "FormSubmission"
      WHERE ${where}
    `,
  ]);

  return {
    ids: rows.map((row) => row.id),
    total: Number(counted[0]?.count ?? 0),
  };
}

/**
 * Ids for the export, walked in batches so a form with a hundred thousand
 * submissions never lands in memory at once. Oldest first, matching the CSV's
 * existing order.
 */
export async function* iterateSubmissionIds(
  filter: SubmissionFilter,
  batchSize = 500
): AsyncGenerator<string[]> {
  const where = whereSql(filter);
  let offset = 0;

  for (;;) {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "FormSubmission"
      WHERE ${where}
      ORDER BY "createdAt" ASC, "id" ASC
      LIMIT ${batchSize} OFFSET ${offset}
    `;
    if (rows.length === 0) return;
    yield rows.map((row) => row.id);
    if (rows.length < batchSize) return;
    offset += batchSize;
  }
}

export function parseSubmissionStatus(
  raw: string | undefined
): FormSubmissionStatus | "all" {
  if (raw === "NEW" || raw === "READ" || raw === "ARCHIVED" || raw === "SPAM") {
    return raw;
  }
  return "all";
}
