"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type {
  CustomerMembership,
  MembershipLevel,
  MembershipPlan,
  MembershipStatus,
} from "@prisma/client";
import {
  Ban,
  CalendarPlus,
  Infinity,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  Search,
  TimerOff,
  UserPlus,
  X,
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
import { TabBar } from "@/components/ui/tab-bar";
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
import { membershipAccess, type AccessState } from "@/lib/membership-dashboard";
import { cn, formatDate } from "@/lib/utils";

type MemberRow = CustomerMembership & {
  customer: { name: string; email: string };
  plan: Pick<MembershipPlan, "id" | "name" | "level">;
};

type PlanOption = Pick<MembershipPlan, "id" | "name" | "level" | "isActive" | "archivedAt">;

export type MemberStatusFilter = "ALL" | MembershipStatus | "EXPIRING";

export type MemberFilters = {
  q: string;
  status: MemberStatusFilter;
  level: "ALL" | MembershipLevel;
  planId: string;
};

const STATUS_TABS: { key: MemberStatusFilter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "EXPIRING", label: "Expiring soon" },
  { key: "PENDING", label: "Pending" },
  { key: "EXPIRED", label: "Expired" },
  { key: "CANCELLED", label: "Cancelled" },
];

function AccessBadge({ state }: { state: AccessState }) {
  switch (state.kind) {
    case "active":
      return <Badge variant="success">Active</Badge>;
    case "expiring":
      return <Badge variant="success" className="before:bg-amber-500">Expiring</Badge>;
    case "lapsed":
      return <Badge variant="success" className="before:bg-orange-500" title="Past its end date; the nightly sweep will mark it expired.">Lapsed</Badge>;
    case "pending":
      return <Badge variant="success" className="before:bg-kv-subtle">Pending payment</Badge>;
    case "cancelled":
      return <Badge variant="success" className="before:bg-red-500">Cancelled</Badge>;
    case "expired":
      return <Badge variant="success" className="before:bg-kv-subtle">Expired</Badge>;
  }
}

function accessDetail(state: AccessState, expiresAt: Date | null) {
  if (state.kind === "active") return state.daysLeft === null ? "Lifetime access" : `${state.daysLeft} days left`;
  if (state.kind === "expiring") return state.daysLeft === 1 ? "Ends tomorrow" : `${state.daysLeft} days left`;
  if (expiresAt) return `Ended ${formatDate(expiresAt)}`;
  return "—";
}

export function MembersTable({
  members,
  plans,
  now,
  filters,
  counts,
  matchingCount,
  assignOpenByDefault = false,
}: {
  members: MemberRow[];
  /** Every plan, for filtering; archived ones can't be assigned. */
  plans: PlanOption[];
  now: number;
  /** Filters are applied by the server so they cover every page, not just this one. */
  filters: MemberFilters;
  counts: Partial<Record<MemberStatusFilter, number>>;
  matchingCount: number;
  assignOpenByDefault?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/dashboard/membership/members";
  const [pending, startTransition] = useTransition();
  const assignable = plans.filter((plan) => !plan.archivedAt);
  const [assignOpen, setAssignOpen] = useState(assignOpenByDefault && assignable.length > 0);
  const [confirmCancel, setConfirmCancel] = useState<MemberRow | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [query, setQuery] = useState(filters.q);
  const defaultPlanId =
    (filters.planId && assignable.some((plan) => plan.id === filters.planId) ? filters.planId : undefined) ??
    assignable.find((plan) => plan.isActive)?.id ??
    assignable[0]?.id ??
    "";
  const [form, setForm] = useState({ name: "", email: "", planId: defaultPlanId });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function hrefFor(next: Partial<MemberFilters>) {
    const merged = { ...filters, q: query, ...next };
    const params = new URLSearchParams();
    if (merged.q.trim()) params.set("q", merged.q.trim());
    if (merged.status !== "ALL") params.set("status", merged.status);
    if (merged.level !== "ALL") params.set("level", merged.level);
    if (merged.planId) params.set("plan", merged.planId);
    const qs = params.toString();
    // Changing a filter always returns to page 1.
    return qs ? `${pathname}?${qs}` : pathname;
  }

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
      toast.success(res.data?.renewed ? "Existing access extended" : "Membership assigned");
      setAssignOpen(false);
      setForm({ name: "", email: "", planId: defaultPlanId });
      router.refresh();
    });
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string, done?: () => void) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong");
        return;
      }
      toast.success(success);
      done?.();
      router.refresh();
    });
  }

  const hasFilters = Boolean(filters.q || filters.status !== "ALL" || filters.level !== "ALL" || filters.planId);

  return (
    <>
      <div className="flex flex-col gap-[10px] border-b-[0.8px] border-kv-border p-[10px]">
        <div className="flex flex-col gap-[10px] lg:flex-row lg:items-center lg:justify-between">
          <TabBar
            ariaLabel="Filter members by status"
            active={filters.status}
            items={STATUS_TABS.map((tab) => ({
              key: tab.key,
              label: tab.label,
              href: hrefFor({ status: tab.key }),
              count: tab.key === "ALL" ? undefined : counts[tab.key],
            }))}
          />
          <Button
            size="sm"
            onClick={() => setAssignOpen(true)}
            disabled={assignable.length === 0}
            title={assignable.length === 0 ? "Create a plan first" : undefined}
          >
            <UserPlus /> Assign membership
          </Button>
        </div>
        <div className="grid gap-[8px] sm:grid-cols-[minmax(0,1fr)_170px_200px]">
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(hrefFor({ q: query }));
            }}
          >
            <Search className="pointer-events-none absolute left-[10px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-kv-muted-fg" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search member, email, or plan"
              className="pl-[30px] pr-[30px]"
              aria-label="Search members"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  router.push(hrefFor({ q: "" }));
                }}
                className="absolute right-[8px] top-1/2 -translate-y-1/2 rounded p-[2px] text-kv-muted-fg hover:text-kv-fg"
                aria-label="Clear search"
              >
                <X className="h-[14px] w-[14px]" />
              </button>
            ) : null}
          </form>
          <Select
            value={filters.level}
            onValueChange={(value) => router.push(hrefFor({ level: value as MemberFilters["level"] }))}
          >
            <SelectTrigger aria-label="Filter by level">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All levels</SelectItem>
              <SelectItem value="FREE">Free</SelectItem>
              <SelectItem value="BASIC">Basic</SelectItem>
              <SelectItem value="PREMIUM">Premium</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.planId || "ALL"}
            onValueChange={(value) => router.push(hrefFor({ planId: value === "ALL" ? "" : value }))}
          >
            <SelectTrigger aria-label="Filter by plan">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All plans</SelectItem>
              {plans.map((plan) => (
                <SelectItem key={plan.id} value={plan.id}>
                  {plan.name}
                  {plan.archivedAt ? " (archived)" : plan.isActive ? "" : " (hidden)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {members.length === 0 ? (
        <div className="px-[16px] py-[40px] text-center">
          <p className="text-[13px] font-medium text-kv-fg">
            {assignable.length === 0 ? "Create a plan first" : "No memberships match"}
          </p>
          <p className="mt-[4px] text-[12px] text-kv-muted-fg">
            {assignable.length === 0
              ? "Members are always assigned to a plan."
              : hasFilters
                ? "Try a different search or filter."
                : "Assign a customer to a plan, or share your membership page."}
          </p>
          {hasFilters ? (
            <Button variant="link" size="sm" className="mt-[6px]" onClick={() => { setQuery(""); router.push(pathname); }}>
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : (
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-[14px]">Member</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Ends</TableHead>
              <TableHead className="w-[1%] pr-[14px] text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => {
              const state = membershipAccess(m, now);
              const hasAccess = state.kind === "active" || state.kind === "expiring";
              return (
                <TableRow key={m.id}>
                  <TableCell className="pl-[14px]">
                    <p className="text-[13px] font-medium text-kv-fg">{m.customer.name}</p>
                    <p className="truncate text-[12px] text-kv-muted-fg">{m.customer.email}</p>
                  </TableCell>
                  <TableCell>
                    <p className="text-[13px] text-kv-fg">{m.plan.name}</p>
                    {m.plan.name !== MEMBERSHIP_LEVEL_LABEL[m.plan.level] ? (
                      <p className="text-[11px] text-kv-muted-fg">{MEMBERSHIP_LEVEL_LABEL[m.plan.level]}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <AccessBadge state={state} />
                    <p
                      className={cn(
                        "mt-[4px] text-[11px]",
                        state.kind === "expiring" || state.kind === "lapsed" ? "text-amber-700" : "text-kv-muted-fg"
                      )}
                    >
                      {accessDetail(state, m.expiresAt)}
                      {m.cancelAtPeriodEnd && hasAccess ? " · won't renew" : ""}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[12px] text-kv-muted-fg">{formatDate(m.startedAt)}</TableCell>
                  <TableCell className="whitespace-nowrap text-[12px] text-kv-muted-fg">
                    {m.expiresAt ? formatDate(m.expiresAt) : "Never"}
                  </TableCell>
                  <TableCell className="pr-[14px] text-right">
                    <div className="flex items-center justify-end gap-[4px]">
                      {state.kind === "expiring" || state.kind === "lapsed" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => run(() => extendMembershipAction(m.id, 30), `${m.customer.name} extended 30 days`)}
                        >
                          <CalendarPlus /> +30 days
                        </Button>
                      ) : null}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions for ${m.customer.name}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          {hasAccess ? (
                            <>
                              <DropdownMenuItem
                                disabled={pending}
                                onSelect={() => {
                                  run(() => extendMembershipAction(m.id, 30), "Extended 30 days");
                                }}
                              >
                                <CalendarPlus /> Extend 30 days
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={pending}
                                onSelect={() => {
                                  run(() => extendMembershipAction(m.id, 365), "Extended 1 year");
                                }}
                              >
                                <CalendarPlus /> Extend 1 year
                              </DropdownMenuItem>
                              {m.expiresAt ? (
                                <DropdownMenuItem
                                  disabled={pending}
                                  onSelect={() => {
                                    run(() => extendMembershipAction(m.id, 0), "Set to lifetime access");
                                  }}
                                >
                                  <Infinity /> Make lifetime
                                </DropdownMenuItem>
                              ) : null}
                            </>
                          ) : (
                            <DropdownMenuItem
                              disabled={pending}
                              onSelect={() => {
                                run(
                                  () => setMembershipStatusAction(m.id, "ACTIVE"),
                                  `${m.customer.name} reactivated with a new access period`
                                );
                              }}
                            >
                              <RotateCcw /> Reactivate (new period)
                            </DropdownMenuItem>
                          )}
                          {hasAccess || state.kind === "lapsed" ? (
                            <>
                              <DropdownMenuSeparator />
                              {state.kind === "lapsed" ? (
                                <DropdownMenuItem
                                  disabled={pending}
                                  onSelect={() => {
                                    run(() => setMembershipStatusAction(m.id, "EXPIRED"), "Marked expired");
                                  }}
                                >
                                  <TimerOff /> Mark expired now
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault();
                                  setConfirmCancel(m);
                                }}
                                className="text-red-600 focus:bg-red-50 focus:text-red-700"
                              >
                                <Ban /> Cancel access
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {members.length > 0 ? (
        <p className="kv-tabular border-t-[0.8px] border-kv-border px-[14px] py-[8px] text-[12px] text-kv-muted-fg">
          {matchingCount.toLocaleString()} {matchingCount === 1 ? "membership" : "memberships"}
          {hasFilters ? " match the current filters" : ""}
        </p>
      ) : null}

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign membership</DialogTitle>
            <DialogDescription>
              Access starts now. The customer is created if their email isn&apos;t known yet, and gets a
              welcome email. If they already hold this plan, their access is extended instead.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitAssign} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="m-name">Full name</Label>
              <Input
                id="m-name"
                autoFocus
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name && <p className="text-xs text-kv-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-email">Email</Label>
              <Input
                id="m-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                aria-invalid={Boolean(errors.email)}
              />
              {errors.email && <p className="text-xs text-kv-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-plan">Plan</Label>
              <Select value={form.planId} onValueChange={(v) => setForm((f) => ({ ...f, planId: v }))}>
                <SelectTrigger id="m-plan">
                  <SelectValue placeholder="Pick a plan" />
                </SelectTrigger>
                <SelectContent>
                  {assignable.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {MEMBERSHIP_LEVEL_LABEL[p.level]}
                      {p.isActive ? "" : " (hidden)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.planId && <p className="text-xs text-kv-destructive">{errors.planId}</p>}
            </div>
            {serverError && !Object.keys(errors).length ? (
              <div role="alert" className="rounded-[8px] border-[0.8px] border-red-200 bg-red-50/70 px-[12px] py-[8px] text-[12px] text-red-700">
                {serverError}
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAssignOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !form.planId}>
                {pending ? <Loader2 className="animate-spin" /> : <UserPlus />}
                Assign
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(confirmCancel)} onOpenChange={(o) => !o && setConfirmCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {confirmCancel?.customer.name}&apos;s membership?</AlertDialogTitle>
            <AlertDialogDescription>
              Access to {confirmCancel?.plan.name} ends immediately. Payment and membership history stay
              available, and you can reactivate them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep access</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmCancel)
                  run(() => removeMembershipAction(confirmCancel.id), "Membership cancelled", () => setConfirmCancel(null));
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
