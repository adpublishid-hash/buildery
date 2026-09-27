"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  UserPlus,
  CircleCheck,
  CirclePause,
  CircleX,
} from "lucide-react";
import type { AffiliateStatus } from "@prisma/client";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  addAffiliateAction,
  regenerateReferralCodeAction,
  removeAffiliateAction,
  setAffiliateStatusAction,
} from "@/lib/actions/affiliate";
import { formatPrice } from "@/lib/utils";

export type AffiliateRow = {
  id: string;
  referralCode: string;
  status: AffiliateStatus;
  customer: { name: string; email: string };
  clicks: number;
  uniqueClicks: number;
  leads: number;
  sales: number;
  earned: number;
  conversionRate: number;
};

export function AffiliatesTable({
  affiliates,
  appOrigin,
  canManage,
}: {
  affiliates: AffiliateRow[];
  appOrigin: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [addOpen, setAddOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AffiliateRow | null>(null);
  const [form, setForm] = useState({ name: "", email: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    setErrors({});
    const fd = new FormData();
    fd.set("name", form.name);
    fd.set("email", form.email);

    startTransition(async () => {
      const res = await addAffiliateAction(fd);
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
      toast.success("Affiliate added");
      setForm({ name: "", email: "" });
      setAddOpen(false);
      router.refresh();
    });
  }

  function regenerate(id: string) {
    startTransition(async () => {
      const res = await regenerateReferralCodeAction(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("New referral code");
      router.refresh();
    });
  }

  function copyLink(code: string) {
    const link = `${appOrigin}/r/${code}`;
    navigator.clipboard
      ?.writeText(link)
      .then(() => toast.success("Referral link copied"))
      .catch(() => toast.error("Could not copy"));
  }

  function remove() {
    if (!confirmDelete) return;
    startTransition(async () => {
      const res = await removeAffiliateAction(confirmDelete.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Affiliate removed");
      setConfirmDelete(null);
      router.refresh();
    });
  }

  function changeStatus(id: string, status: AffiliateStatus) {
    startTransition(async () => {
      const res = await setAffiliateStatusAction(id, status);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Affiliate ${status.toLowerCase()}`);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex justify-end pb-3">
        {canManage ? (
        <Button onClick={() => setAddOpen(true)}>
          <UserPlus /> Add affiliate
        </Button>
        ) : null}
      </div>

      {affiliates.length ? <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-zinc-200">
        <Table className="min-w-[1040px]">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Affiliate</TableHead>
              <TableHead>Referral link</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Clicks</TableHead>
              <TableHead>Unique</TableHead>
              <TableHead>Leads</TableHead>
              <TableHead>Sales</TableHead>
              <TableHead>Conversion</TableHead>
              <TableHead>Earned</TableHead>
              <TableHead className="w-12 pr-4 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {affiliates.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="pl-4">
                  <p className="text-sm font-medium text-zinc-900">
                    {a.customer.name}
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    {a.customer.email}
                  </p>
                </TableCell>
                <TableCell>
                  {a.status === "ACTIVE" ? <button
                    type="button"
                    onClick={() => copyLink(a.referralCode)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-900 transition-colors hover:bg-zinc-200"
                    title="Copy referral link"
                  >
                    /r/{a.referralCode}
                    <Copy className="h-3 w-3" />
                  </button> : <span className="text-xs text-zinc-400">Inactive</span>}
                </TableCell>
                <TableCell><Badge variant="outline">{a.status.charAt(0) + a.status.slice(1).toLowerCase()}</Badge></TableCell>
                <TableCell className="text-sm text-zinc-700">
                  {a.clicks}
                </TableCell>
                <TableCell className="text-sm text-zinc-700">{a.uniqueClicks}</TableCell>
                <TableCell className="text-sm text-zinc-700">
                  {a.leads}
                </TableCell>
                <TableCell className="text-sm text-zinc-700">
                  {a.sales}
                </TableCell>
                <TableCell className="text-sm text-zinc-700">{a.conversionRate.toFixed(1)}%</TableCell>
                <TableCell className="text-sm font-medium text-zinc-900">
                  {formatPrice(a.earned)}
                </TableCell>
                <TableCell className="pr-4 text-right">
                  {canManage ? <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Affiliate actions"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem
                        disabled={a.status !== "ACTIVE"}
                        onSelect={(e) => {
                          e.preventDefault();
                          copyLink(a.referralCode);
                        }}
                      >
                        <Copy /> Copy link
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={pending}
                        onSelect={(e) => {
                          e.preventDefault();
                          regenerate(a.id);
                        }}
                      >
                        <RefreshCw /> New code
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {a.status !== "ACTIVE" ? <DropdownMenuItem onSelect={(e) => { e.preventDefault(); changeStatus(a.id, "ACTIVE"); }}>
                        <CircleCheck /> Approve / activate
                      </DropdownMenuItem> : <DropdownMenuItem onSelect={(e) => { e.preventDefault(); changeStatus(a.id, "SUSPENDED"); }}>
                        <CirclePause /> Suspend
                      </DropdownMenuItem>}
                      {a.status === "PENDING" ? <DropdownMenuItem onSelect={(e) => { e.preventDefault(); changeStatus(a.id, "REJECTED"); }} className="text-red-600 focus:text-red-700">
                        <CircleX /> Reject
                      </DropdownMenuItem> : null}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          setConfirmDelete(a);
                        }}
                        className="text-red-600 focus:bg-red-50 focus:text-red-700"
                      >
                        <Trash2 /> Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu> : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div> : null}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add affiliate</DialogTitle>
            <DialogDescription>
              Generates a unique referral code. Existing customers are reused
              by email.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitAdd} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="a-name">Full name</Label>
              <Input
                id="a-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
              {errors.name && (
                <p className="text-xs text-red-600">{errors.name}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="a-email">Email</Label>
              <Input
                id="a-email"
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
              />
              {errors.email && (
                <p className="text-xs text-red-600">{errors.email}</p>
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
                onClick={() => setAddOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <UserPlus />}
                Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {confirmDelete?.customer.name} from the program?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Their referral code stops working immediately. Existing clicks,
              commissions, and payouts remain attached for audit history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                remove();
              }}
              disabled={pending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {pending ? "Archiving…" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
