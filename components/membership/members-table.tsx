"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  CustomerMembership,
  MembershipPlan,
  MembershipStatus,
} from "@prisma/client";
import {
  CalendarPlus,
  Infinity,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  assignMembershipAction,
  extendMembershipAction,
  removeMembershipAction,
  setMembershipStatusAction,
} from "@/lib/actions/membership";
import { MEMBERSHIP_LEVEL_LABEL } from "@/lib/labels";
import { cn, formatDate } from "@/lib/utils";

type MemberRow = CustomerMembership & {
  customer: { name: string; email: string };
  plan: Pick<MembershipPlan, "id" | "name" | "level">;
};

const STATUSES: MembershipStatus[] = ["ACTIVE", "CANCELLED", "EXPIRED"];

const STATUS_VARIANT: Record<
  MembershipStatus,
  "default" | "secondary" | "success" | "outline"
> = {
  PENDING: "secondary",
  ACTIVE: "success",
  CANCELLED: "outline",
  EXPIRED: "secondary",
};

export type MemberFilters = {
  q: string;
  status: "ALL" | MembershipStatus;
  level: "ALL" | "FREE" | "BASIC" | "PREMIUM";
};

export function MembersTable({
  members,
  plans,
  now,
  filters,
  matchingCount,
}: {
  members: MemberRow[];
  plans: Pick<MembershipPlan, "id" | "name" | "level">[];
  now: number;
  /** Filters are applied by the server so they cover every page, not just this one. */
  filters: MemberFilters;
  matchingCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [assignOpen, setAssignOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<MemberRow | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [query, setQuery] = useState(filters.q);
  const statusFilter = filters.status;
  const levelFilter = filters.level;

  function applyFilters(next: Partial<MemberFilters>) {
    const merged = { ...filters, q: query, ...next };
    const params = new URLSearchParams();
    if (merged.q.trim()) params.set("q", merged.q.trim());
    if (merged.status !== "ALL") params.set("status", merged.status);
    if (merged.level !== "ALL") params.set("level", merged.level);
    const qs = params.toString();
    // Changing a filter always returns to page 1.
    router.push(qs ? `?${qs}` : "?");
  }
  const [form, setForm] = useState({
    name: "",
    email: "",
    planId: plans[0]?.id ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submitAssign(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    setErrors({});
    const fd = new FormData();
    fd.set("name", form.name);
    fd.set("email", form.email);
    fd.set("planId", form.planId);

    startTransition(async () => {
      const res = await assignMembershipAction(fd);
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
      toast.success("Membership assigned");
      setAssignOpen(false);
      setForm({ name: "", email: "", planId: plans[0]?.id ?? "" });
      router.refresh();
    });
  }

  function changeStatus(id: string, status: MembershipStatus) {
    startTransition(async () => {
      const res = await setMembershipStatusAction(id, status);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Set to ${status.toLowerCase()}`);
      router.refresh();
    });
  }

  function extend(id: string, days: number) {
    startTransition(async () => {
      const res = await extendMembershipAction(id, days);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(days === 0 ? "Set to lifetime access" : `Extended ${days} days`);
      router.refresh();
    });
  }

  function remove() {
    if (!confirmDelete) return;
    startTransition(async () => {
      const res = await removeMembershipAction(confirmDelete.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Membership cancelled");
      setConfirmDelete(null);
      router.refresh();
    });
  }

  const filteredMembers = members;

  return (
    <>
      <div className="flex flex-col gap-3 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_180px] lg:w-[720px]">
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              applyFilters({ q: query });
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => {
                if (query.trim() !== filters.q) applyFilters({ q: query });
              }}
              placeholder="Search member, email, or plan..."
              className="pl-9"
            />
          </form>
          <Select
            value={statusFilter}
            onValueChange={(value) =>
              applyFilters({ status: value as "ALL" | MembershipStatus })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All status</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
              <SelectItem value="EXPIRED">Expired</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={levelFilter}
            onValueChange={(value) =>
              applyFilters({ level: value as "ALL" | "FREE" | "BASIC" | "PREMIUM" })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All levels</SelectItem>
              <SelectItem value="FREE">Free</SelectItem>
              <SelectItem value="BASIC">Basic</SelectItem>
              <SelectItem value="PREMIUM">Premium</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={() => setAssignOpen(true)}
          disabled={plans.length === 0}
        >
          <UserPlus /> Assign membership
        </Button>
      </div>

      <p className="pb-3 text-xs text-zinc-500">
        {matchingCount} {matchingCount === 1 ? "membership" : "memberships"} match.
      </p>

      {plans.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-500">
          Create a plan first to assign memberships.
        </p>
      ) : filteredMembers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-10 text-center text-sm text-zinc-500">
          No memberships match the current filters.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Customer</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-12 pr-4 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMembers.map((m) => {
                const activeNow =
                  m.status === "ACTIVE" &&
                  (!m.expiresAt || m.expiresAt.getTime() > now);
                return (
                <TableRow key={m.id}>
                  <TableCell className="pl-4">
                    <p className="text-sm font-medium text-zinc-900">
                      {m.customer.name}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {m.customer.email}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm text-zinc-700">
                    {m.plan.name}
                    <span className="ml-1.5 text-xs text-zinc-400">
                      · {MEMBERSHIP_LEVEL_LABEL[m.plan.level]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[m.status]}>
                      {m.status.charAt(0) + m.status.slice(1).toLowerCase()}
                    </Badge>
                    {m.status === "ACTIVE" && !activeNow ? (
                      <span className="ml-2 text-xs text-amber-600">
                        date passed
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500">
                    {formatDate(m.startedAt)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-xs",
                      activeNow ? "text-zinc-500" : "text-amber-700"
                    )}
                  >
                    {m.expiresAt ? formatDate(m.expiresAt) : "Lifetime"}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Membership actions"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          disabled={pending}
                          onSelect={(e) => {
                            e.preventDefault();
                            extend(m.id, 30);
                          }}
                        >
                          <CalendarPlus /> Extend 30 days
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={pending}
                          onSelect={(e) => {
                            e.preventDefault();
                            extend(m.id, 365);
                          }}
                        >
                          <CalendarPlus /> Extend 1 year
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={pending}
                          onSelect={(e) => {
                            e.preventDefault();
                            extend(m.id, 0);
                          }}
                        >
                          <Infinity /> Set lifetime
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {STATUSES.filter((s) => s !== m.status).map((s) => (
                          <DropdownMenuItem
                            key={s}
                            disabled={pending}
                            onSelect={(e) => {
                              e.preventDefault();
                              changeStatus(m.id, s);
                            }}
                          >
                            Mark as {s.toLowerCase()}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            setConfirmDelete(m);
                          }}
                          className="text-red-600 focus:bg-red-50 focus:text-red-700"
                        >
                          <Trash2 /> Cancel access
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign membership</DialogTitle>
            <DialogDescription>
              The customer is created if their email isn&apos;t known yet.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitAssign} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="m-name">Full name</Label>
              <Input
                id="m-name"
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
              <Label htmlFor="m-email">Email</Label>
              <Input
                id="m-email"
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
            <div className="space-y-2">
              <Label htmlFor="m-plan">Plan</Label>
              <Select
                value={form.planId}
                onValueChange={(v) => setForm((f) => ({ ...f, planId: v }))}
              >
                <SelectTrigger id="m-plan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {MEMBERSHIP_LEVEL_LABEL[p.level]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.planId && (
                <p className="text-xs text-red-600">{errors.planId}</p>
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
                onClick={() => setAssignOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Plus />}
                Assign
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
              Cancel {confirmDelete?.customer.name}&apos;s membership?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Access ends immediately, while payment and membership history
              remain available.
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
              {pending ? "Cancelling…" : "Cancel access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
