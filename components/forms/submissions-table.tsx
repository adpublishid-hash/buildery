"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, CheckCircle2, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import type { FormSubmissionStatus } from "@prisma/client";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  bulkDeleteSubmissionsAction,
  bulkUpdateSubmissionStatusAction,
} from "@/lib/actions/form-submission";
import { cn } from "@/lib/utils";
import { SubmissionActions } from "./submission-actions";

export type SubmissionRow = {
  id: string;
  createdAt: string;
  status: FormSubmissionStatus;
  notes: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  referrer: string | null;
  data: Record<string, unknown>;
  deliveries: Array<{
    id: string;
    kind: "EMAIL" | "WEBHOOK" | "TELEGRAM";
    status: "PENDING" | "SENT" | "FAILED";
    target: string;
    attempts: number;
    lastError: string | null;
  }>;
};

export type SubmissionField = { id: string; label: string; name: string };

type Props = {
  formId: string;
  fields: SubmissionField[];
  submissions: SubmissionRow[];
};

const STATUS_LABEL: Record<FormSubmissionStatus, string> = {
  NEW: "New",
  READ: "Read",
  ARCHIVED: "Archived",
  SPAM: "Spam",
};

const STATUS_VARIANT: Record<
  FormSubmissionStatus,
  "default" | "secondary" | "success" | "outline"
> = {
  NEW: "default",
  READ: "success",
  ARCHIVED: "secondary",
  SPAM: "outline",
};

export function SubmissionsTable({ formId, fields, submissions }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const allSelected = useMemo(
    () => submissions.length > 0 && selected.size === submissions.length,
    [submissions.length, selected.size]
  );

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(submissions.map((s) => s.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function bulkUpdate(status: FormSubmissionStatus) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    startTransition(async () => {
      const res = await bulkUpdateSubmissionStatusAction(formId, ids, status);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Updated ${res.data?.updated} submissions`);
      setSelected(new Set());
      router.refresh();
    });
  }

  function bulkDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} submission${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) {
      return;
    }
    startTransition(async () => {
      const res = await bulkDeleteSubmissionsAction(formId, ids);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Deleted ${res.data?.deleted} submissions`);
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
          <span className="text-sm font-medium text-zinc-700">
            {selected.size} selected
          </span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => bulkUpdate("READ")}
          >
            <CheckCircle2 className="h-4 w-4" /> Mark read
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => bulkUpdate("ARCHIVED")}
          >
            <Archive className="h-4 w-4" /> Archive
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => bulkUpdate("SPAM")}
          >
            <ShieldAlert className="h-4 w-4" /> Mark spam
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={bulkDelete}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}{" "}
            Delete
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pl-4">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-zinc-300"
                />
              </TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Status</TableHead>
              {fields.map((f) => (
                <TableHead key={f.id}>{f.label}</TableHead>
              ))}
              <TableHead className="w-20 pr-4 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissions.map((s) => (
              <TableRow
                key={s.id}
                className={cn(
                  selected.has(s.id) && "bg-zinc-50",
                  s.status === "NEW" && "font-medium"
                )}
              >
                <TableCell className="pl-4">
                  <input
                    type="checkbox"
                    aria-label={`Select submission ${s.id}`}
                    checked={selected.has(s.id)}
                    onChange={() => toggleOne(s.id)}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-zinc-500">
                  {new Date(s.createdAt).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[s.status]}>
                    {STATUS_LABEL[s.status]}
                  </Badge>
                </TableCell>
                {fields.map((f) => (
                  <TableCell
                    key={f.id}
                    className="max-w-xs truncate text-sm text-zinc-700"
                    title={cellText(s.data, f.name)}
                  >
                    {cellText(s.data, f.name) || (
                      <span className="text-zinc-300">—</span>
                    )}
                  </TableCell>
                ))}
                <TableCell className="pr-4 text-right">
                  <SubmissionActions fields={fields} submission={s} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function cellText(data: Record<string, unknown>, fieldName: string): string {
  const value = data[fieldName];
  if (value == null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.name === "string") return o.name;
    if (typeof o.url === "string") return String(o.url);
    return JSON.stringify(value);
  }
  return String(value);
}
