"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  CheckCircle2,
  Eye,
  Loader2,
  RotateCw,
  Save,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import type { FormSubmissionStatus } from "@prisma/client";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteFormSubmissionAction,
  retrySubmissionDeliveryAction,
  updateSubmissionNotesAction,
  updateSubmissionStatusAction,
} from "@/lib/actions/form-submission";

type Field = { id: string; label: string; name: string };

type Delivery = {
  id: string;
  kind: "EMAIL" | "WEBHOOK" | "TELEGRAM";
  status: "PENDING" | "SENT" | "FAILED";
  target: string;
  attempts: number;
  lastError: string | null;
};

type Submission = {
  id: string;
  createdAt: string;
  status: FormSubmissionStatus;
  notes: string | null;
  data: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  referrer: string | null;
  deliveries: Delivery[];
};

type Props = {
  fields: Field[];
  submission: Submission;
};

export function SubmissionActions({ fields, submission }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [detailOpen, setDetailOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notes, setNotes] = useState(submission.notes ?? "");
  const [notesDirty, setNotesDirty] = useState(false);

  function remove() {
    startTransition(async () => {
      const res = await deleteFormSubmissionAction(submission.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Submission deleted");
      setConfirmOpen(false);
      router.refresh();
    });
  }

  function setStatus(status: FormSubmissionStatus) {
    startTransition(async () => {
      const res = await updateSubmissionStatusAction(submission.id, status);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Status updated");
      router.refresh();
    });
  }

  function saveNotes() {
    startTransition(async () => {
      const res = await updateSubmissionNotesAction(submission.id, notes);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Notes saved");
      setNotesDirty(false);
      router.refresh();
    });
  }

  function retryDeliveries() {
    startTransition(async () => {
      const res = await retrySubmissionDeliveryAction(submission.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const retried = res.data?.retried ?? 0;
      if (retried === 0) toast("No failed deliveries to retry.");
      else toast.success(`Retried ${retried} deliver${retried === 1 ? "y" : "ies"}.`);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="View submission"
          onClick={() => {
            setDetailOpen(true);
            if (submission.status === "NEW") setStatus("READ");
          }}
        >
          <Eye className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Delete submission"
          onClick={() => setConfirmOpen(true)}
          className="text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Submission detail</DialogTitle>
            <DialogDescription>
              Submitted {new Date(submission.createdAt).toLocaleString()}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusButton
                current={submission.status}
                value="NEW"
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                label="New"
                onClick={() => setStatus("NEW")}
                disabled={pending}
              />
              <StatusButton
                current={submission.status}
                value="READ"
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                label="Read"
                onClick={() => setStatus("READ")}
                disabled={pending}
              />
              <StatusButton
                current={submission.status}
                value="ARCHIVED"
                icon={<Archive className="h-3.5 w-3.5" />}
                label="Archive"
                onClick={() => setStatus("ARCHIVED")}
                disabled={pending}
              />
              <StatusButton
                current={submission.status}
                value="SPAM"
                icon={<ShieldAlert className="h-3.5 w-3.5" />}
                label="Spam"
                onClick={() => setStatus("SPAM")}
                disabled={pending}
              />
            </div>

            {fields.map((field) => (
              <div
                key={field.id}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-3"
              >
                <p className="text-[11px] font-medium uppercase text-zinc-400">
                  {field.label}
                </p>
                <FieldValue value={submission.data[field.name]} />
              </div>
            ))}

            <div className="space-y-2 rounded-lg border border-zinc-200 p-3">
              <p className="text-[11px] font-medium uppercase text-zinc-400">
                Internal notes
              </p>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => {
                  setNotes(e.currentTarget.value);
                  setNotesDirty(true);
                }}
                placeholder="Add a note for your team. Visible only in the dashboard."
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || !notesDirty}
                  onClick={saveNotes}
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save notes
                </Button>
              </div>
            </div>

            {submission.deliveries.length > 0 ? (
              <div className="space-y-2 rounded-lg border border-zinc-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium uppercase text-zinc-400">
                    Deliveries
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={retryDeliveries}
                    disabled={pending}
                  >
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCw className="h-4 w-4" />
                    )}{" "}
                    Retry failed
                  </Button>
                </div>
                <ul className="space-y-1.5 text-xs">
                  {submission.deliveries.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-medium uppercase text-zinc-600">
                        {d.kind}
                      </span>
                      <span className="truncate text-zinc-700">{d.target}</span>
                      <span
                        className={
                          d.status === "SENT"
                            ? "text-emerald-600"
                            : d.status === "FAILED"
                              ? "text-red-600"
                              : "text-zinc-400"
                        }
                      >
                        {d.status}
                      </span>
                      <span className="text-zinc-400">
                        · {d.attempts} attempt{d.attempts === 1 ? "" : "s"}
                      </span>
                      {d.lastError ? (
                        <span className="basis-full pl-2 text-red-500">
                          {d.lastError}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-3">
              <Meta label="IP address" value={submission.ipAddress || "—"} />
              <Meta label="Referrer" value={submission.referrer || "—"} />
              <Meta label="User agent" value={submission.userAgent || "—"} />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this submission?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the submission from the dashboard and future CSV
              exports.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                remove();
              }}
              disabled={pending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {pending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function StatusButton({
  current,
  value,
  icon,
  label,
  onClick,
  disabled,
}: {
  current: FormSubmissionStatus;
  value: FormSubmissionStatus;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || active}
      className={
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition " +
        (active
          ? "border-zinc-900 bg-zinc-950 text-white"
          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-50")
      }
    >
      {icon}
      {label}
    </button>
  );
}

function FieldValue({ value }: { value: unknown }) {
  if (value == null || value === "") {
    return <p className="mt-1 text-sm text-zinc-400">—</p>;
  }
  if (Array.isArray(value)) {
    return (
      <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">
        {value.join(", ")}
      </p>
    );
  }
  if (typeof value === "boolean") {
    return (
      <p className="mt-1 text-sm text-zinc-800">{value ? "Yes" : "No"}</p>
    );
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.url === "string") {
      return (
        <p className="mt-1 text-sm">
          <a
            href={String(obj.url)}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 underline"
          >
            {String(obj.name ?? obj.url)}
          </a>
          {typeof obj.size === "number" ? (
            <span className="ml-2 text-xs text-zinc-400">
              ({Math.max(1, Math.round((obj.size as number) / 1024))} KB)
            </span>
          ) : null}
        </p>
      );
    }
  }
  return (
    <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">
      {String(value)}
    </p>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3">
      <p className="text-[11px] font-medium uppercase text-zinc-400">{label}</p>
      <p className="mt-1 break-words text-xs text-zinc-600">{value}</p>
    </div>
  );
}
