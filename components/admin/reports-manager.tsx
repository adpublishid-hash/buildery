"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AbuseReport, AbuseReportStatus } from "@prisma/client";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createReportAction,
  deleteReportAction,
  setReportStatusAction,
} from "@/lib/actions/admin";
import { formatDate } from "@/lib/utils";

type ReportRow = AbuseReport & {
  workspace: { name: string; slug: string } | null;
};

const STATUSES: AbuseReportStatus[] = ["OPEN", "RESOLVED", "DISMISSED"];

const STATUS_VARIANT: Record<
  AbuseReportStatus,
  "default" | "secondary" | "success" | "outline"
> = {
  OPEN: "default",
  RESOLVED: "success",
  DISMISSED: "outline",
};

export function ReportsManager({ reports }: { reports: ReportRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    workspaceId: "",
    reporterEmail: "",
    reason: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setServerError(null);
    const fd = new FormData();
    fd.set("workspaceId", form.workspaceId);
    fd.set("reporterEmail", form.reporterEmail);
    fd.set("reason", form.reason);

    startTransition(async () => {
      const res = await createReportAction(fd);
      if (!res.ok) {
        setServerError(res.error);
        if (res.fieldErrors) {
          const flat: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.fieldErrors)) {
            if (v?.[0]) flat[k] = v[0];
          }
          setErrors(flat);
        }
        return;
      }
      toast.success("Report filed");
      setForm({ workspaceId: "", reporterEmail: "", reason: "" });
      setOpen(false);
      router.refresh();
    });
  }

  function changeStatus(id: string, status: AbuseReportStatus) {
    startTransition(async () => {
      const res = await setReportStatusAction(id, status);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Marked ${status.toLowerCase()}`);
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteReportAction(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Report deleted");
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex justify-end pb-3">
        <Button onClick={() => setOpen(true)}>
          <Plus /> File report
        </Button>
      </div>

      {reports.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-10 text-center text-sm text-zinc-400">
          No abuse reports. The platform is quiet.
        </p>
      ) : (
        <ul className="space-y-2">
          {reports.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={STATUS_VARIANT[r.status]}>
                    {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                  </Badge>
                  {r.workspace ? (
                    <span className="text-xs text-zinc-500">
                      {r.workspace.name} (/{r.workspace.slug})
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-400">
                      No workspace linked
                    </span>
                  )}
                  <span className="text-xs text-zinc-400">
                    {formatDate(r.createdAt)}
                  </span>
                </div>
                <p className="mt-1.5 whitespace-pre-line text-sm text-zinc-700">
                  {r.reason}
                </p>
                {r.reporterEmail ? (
                  <p className="mt-1 text-xs text-zinc-400">
                    Reported by {r.reporterEmail}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Select
                  value={r.status}
                  onValueChange={(v) =>
                    changeStatus(r.id, v as AbuseReportStatus)
                  }
                  disabled={pending}
                >
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.charAt(0) + s.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete report"
                  disabled={pending}
                  onClick={() => remove(r.id)}
                >
                  <Trash2 className="h-4 w-4 text-zinc-400" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>File an abuse report</DialogTitle>
            <DialogDescription>
              Record a spam or abuse complaint for follow-up.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="r-ws">Workspace ID (optional)</Label>
              <Input
                id="r-ws"
                placeholder="cmp…"
                value={form.workspaceId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, workspaceId: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-email">Reporter email (optional)</Label>
              <Input
                id="r-email"
                type="email"
                value={form.reporterEmail}
                onChange={(e) =>
                  setForm((f) => ({ ...f, reporterEmail: e.target.value }))
                }
              />
              {errors.reporterEmail && (
                <p className="text-xs text-red-600">{errors.reporterEmail}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-reason">Reason</Label>
              <Textarea
                id="r-reason"
                rows={4}
                value={form.reason}
                onChange={(e) =>
                  setForm((f) => ({ ...f, reason: e.target.value }))
                }
              />
              {errors.reason && (
                <p className="text-xs text-red-600">{errors.reason}</p>
              )}
            </div>
            {serverError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {serverError}
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                File report
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
