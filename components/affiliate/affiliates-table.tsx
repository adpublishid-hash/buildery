"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  CircleCheck,
  CirclePause,
  CircleX,
  Copy,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Search,
  X,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { TabBar } from "@/components/ui/tab-bar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  bulkSetAffiliateStatusAction,
  regenerateReferralCodeAction,
  setAffiliateStatusAction,
} from "@/lib/actions/affiliate";
import {
  AFFILIATE_STATUS_LABEL,
  affiliateTransitionVerb,
  allowedAffiliateTransitions,
} from "@/lib/affiliate-status";
import { cn, formatDate, formatPrice } from "@/lib/utils";

export type AffiliateRow = {
  id: string;
  referralCode: string;
  status: AffiliateStatus;
  customer: { name: string; email: string };
  joinedAt: Date;
  rejectionReason: string | null;
  hasPayoutAccount: boolean;
  clicks: number;
  uniqueClicks: number;
  leads: number;
  sales: number;
  earned: number;
  unpaid: number;
  conversionRate: number;
};

export type AffiliateFilterStatus = "ALL" | AffiliateStatus;

export type AffiliateFilters = {
  q: string;
  status: AffiliateFilterStatus;
};

const FILTER_TABS: { key: AffiliateFilterStatus; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "PENDING", label: "Pending" },
  { key: "ACTIVE", label: "Active" },
  { key: "SUSPENDED", label: "Suspended" },
  { key: "REJECTED", label: "Rejected" },
  { key: "ARCHIVED", label: "Archived" },
];

// Near-monochrome badges; the dot colour carries the state.
const STATUS_DOT: Record<AffiliateStatus, string> = {
  PENDING: "before:bg-amber-500",
  ACTIVE: "",
  SUSPENDED: "before:bg-orange-500",
  REJECTED: "before:bg-red-500",
  ARCHIVED: "before:bg-kv-subtle",
};

const ACTION_META: Record<AffiliateStatus, { label: string; icon: typeof CircleCheck }> = {
  ACTIVE: { label: "Approve", icon: CircleCheck },
  SUSPENDED: { label: "Suspend", icon: CirclePause },
  REJECTED: { label: "Reject", icon: CircleX },
  ARCHIVED: { label: "Archive", icon: Archive },
  PENDING: { label: "Mark pending", icon: RotateCcw },
};

function actionLabel(from: AffiliateStatus, to: AffiliateStatus) {
  if (to === "ACTIVE" && from === "ARCHIVED") return "Restore";
  if (to === "ACTIVE" && from === "SUSPENDED") return "Reactivate";
  return ACTION_META[to].label;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function AffiliatesTable({
  affiliates,
  appOrigin,
  canManage,
  filters,
  counts,
  matchingCount,
}: {
  affiliates: AffiliateRow[];
  appOrigin: string;
  canManage: boolean;
  filters: AffiliateFilters;
  counts: Record<AffiliateFilterStatus, number>;
  matchingCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/dashboard/affiliate";
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.q);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmArchive, setConfirmArchive] = useState<AffiliateRow | null>(null);
  const [confirmReject, setConfirmReject] = useState<{ rows: AffiliateRow[] } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const selectable = canManage ? affiliates.filter((a) => a.status === "PENDING") : [];
  const selectedRows = selectable.filter((a) => selected.has(a.id));
  const allSelected = selectable.length > 0 && selectedRows.length === selectable.length;

  function hrefFor(next: Partial<AffiliateFilters>) {
    const merged = { ...filters, q: query, ...next };
    const params = new URLSearchParams();
    if (merged.q.trim()) params.set("q", merged.q.trim());
    if (merged.status !== "ALL") params.set("status", merged.status);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function applySearch(value: string) {
    setSelected(new Set());
    router.push(hrefFor({ q: value }));
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function copyLink(code: string) {
    navigator.clipboard
      ?.writeText(`${appOrigin}/r/${code}`)
      .then(() => toast.success("Referral link copied"))
      .catch(() => toast.error("Could not copy"));
  }

  function regenerate(id: string) {
    startTransition(async () => {
      const res = await regenerateReferralCodeAction(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("New referral code issued. The old link keeps working for 90 days.");
      router.refresh();
    });
  }

  function changeStatus(row: AffiliateRow, status: AffiliateStatus, reason?: string, done?: () => void) {
    startTransition(async () => {
      const res = await setAffiliateStatusAction(row.id, status, reason);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${row.customer.name} ${affiliateTransitionVerb(row.status, status)}`);
      done?.();
      router.refresh();
    });
  }

  function bulk(status: "ACTIVE" | "REJECTED", done?: () => void) {
    const ids = selectedRows.map((row) => row.id);
    startTransition(async () => {
      const res = await bulkSetAffiliateStatusAction(ids, status);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const verb = status === "ACTIVE" ? "approved" : "rejected";
      const updated = res.data?.updated ?? 0;
      const skipped = res.data?.skipped ?? 0;
      toast.success(
        `${updated} ${updated === 1 ? "application" : "applications"} ${verb}` +
          (skipped ? ` · ${skipped} skipped` : "")
      );
      setSelected(new Set());
      done?.();
      router.refresh();
    });
  }

  function submitReject() {
    if (!confirmReject) return;
    const close = () => {
      setConfirmReject(null);
      setRejectReason("");
    };
    if (confirmReject.rows.length === 1 && selectedRows.length === 0) {
      changeStatus(confirmReject.rows[0], "REJECTED", rejectReason.trim() || undefined, close);
    } else {
      bulk("REJECTED", close);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-[10px] border-b-[0.8px] border-kv-border p-[10px] lg:flex-row lg:items-center lg:justify-between">
        <TabBar
          ariaLabel="Filter affiliates by status"
          active={filters.status}
          items={FILTER_TABS.map((tab) => ({
            key: tab.key,
            label: tab.label,
            href: hrefFor({ status: tab.key }),
            count: counts[tab.key],
          }))}
        />
        <form
          className="relative w-full lg:w-[280px]"
          onSubmit={(e) => {
            e.preventDefault();
            applySearch(query);
          }}
        >
          <Search className="pointer-events-none absolute left-[10px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-kv-muted-fg" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, or code"
            className="pl-[30px] pr-[30px]"
            aria-label="Search affiliates"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                applySearch("");
              }}
              className="absolute right-[8px] top-1/2 -translate-y-1/2 rounded p-[2px] text-kv-muted-fg hover:text-kv-fg"
              aria-label="Clear search"
            >
              <X className="h-[14px] w-[14px]" />
            </button>
          ) : null}
        </form>
      </div>

      {selectedRows.length > 0 ? (
        <div className="flex animate-kv-fade flex-wrap items-center justify-between gap-[8px] border-b-[0.8px] border-kv-border bg-kv-secondary/60 px-[12px] py-[8px]">
          <p className="text-[12px] text-kv-secondary-fg">
            <span className="kv-tabular font-semibold text-kv-fg">{selectedRows.length}</span>{" "}
            {selectedRows.length === 1 ? "application" : "applications"} selected
          </p>
          <div className="flex items-center gap-[6px]">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={pending}>
              Clear
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmReject({ rows: selectedRows })}
              disabled={pending}
            >
              <CircleX /> Reject
            </Button>
            <Button size="sm" onClick={() => bulk("ACTIVE")} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <CircleCheck />} Approve
            </Button>
          </div>
        </div>
      ) : null}

      {affiliates.length === 0 ? (
        <div className="px-[16px] py-[40px] text-center">
          <p className="text-[13px] font-medium text-kv-fg">No affiliates match</p>
          <p className="mt-[4px] text-[12px] text-kv-muted-fg">
            {filters.q
              ? `Nothing found for “${filters.q}”. Try a different name, email, or code.`
              : filters.status === "PENDING"
                ? "No applications are waiting for review."
                : "Try another status filter."}
          </p>
        </div>
      ) : (
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow>
              {selectable.length > 0 ? (
                <TableHead className="w-[36px] pl-[14px]">
                  <input
                    type="checkbox"
                    className="h-[14px] w-[14px] cursor-pointer accent-[rgb(var(--kv-fg))]"
                    checked={allSelected}
                    onChange={() =>
                      setSelected(allSelected ? new Set() : new Set(selectable.map((row) => row.id)))
                    }
                    aria-label="Select all pending applications"
                  />
                </TableHead>
              ) : null}
              <TableHead className={selectable.length ? undefined : "pl-[14px]"}>Affiliate</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Referral link</TableHead>
              <TableHead className="text-right">Clicks</TableHead>
              <TableHead className="text-right">Sales</TableHead>
              <TableHead className="text-right">Earned</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-[1%] pr-[14px] text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {affiliates.map((a) => {
              const transitions = allowedAffiliateTransitions(a.status);
              const isPending = a.status === "PENDING";
              return (
                <TableRow key={a.id} className={cn(selected.has(a.id) && "bg-kv-secondary/50")}>
                  {selectable.length > 0 ? (
                    <TableCell className="pl-[14px]">
                      {isPending ? (
                        <input
                          type="checkbox"
                          className="h-[14px] w-[14px] cursor-pointer accent-[rgb(var(--kv-fg))]"
                          checked={selected.has(a.id)}
                          onChange={() => toggle(a.id)}
                          aria-label={`Select ${a.customer.name}`}
                        />
                      ) : null}
                    </TableCell>
                  ) : null}
                  <TableCell className={selectable.length ? undefined : "pl-[14px]"}>
                    <div className="flex min-w-0 items-center gap-[10px]">
                      <span
                        aria-hidden
                        className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full border-[0.8px] border-kv-border bg-kv-secondary text-[11px] font-semibold text-kv-secondary-fg"
                      >
                        {initials(a.customer.name) || "?"}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-kv-fg">{a.customer.name}</p>
                        <p className="truncate text-[12px] text-kv-muted-fg">{a.customer.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="success" className={STATUS_DOT[a.status]}>
                      {AFFILIATE_STATUS_LABEL[a.status]}
                    </Badge>
                    {a.status === "REJECTED" && a.rejectionReason ? (
                      <p className="mt-[4px] max-w-[180px] truncate text-[11px] text-kv-muted-fg" title={a.rejectionReason}>
                        {a.rejectionReason}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {a.status === "ACTIVE" ? (
                      <button
                        type="button"
                        onClick={() => copyLink(a.referralCode)}
                        className="inline-flex items-center gap-[6px] rounded-[6px] border-[0.8px] border-kv-border bg-kv-secondary px-[6px] py-[3px] font-mono text-[11px] text-kv-fg transition-colors hover:bg-kv-hover"
                        title="Copy referral link"
                      >
                        /r/{a.referralCode}
                        <Copy className="h-[12px] w-[12px] text-kv-muted-fg" />
                      </button>
                    ) : (
                      <span className="text-[12px] text-kv-muted-fg">
                        {isPending ? "Issued on approval" : "Link disabled"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="kv-tabular text-right">
                    <p className="text-[13px] text-kv-fg">{a.uniqueClicks.toLocaleString()}</p>
                    {a.clicks !== a.uniqueClicks ? (
                      <p className="text-[11px] text-kv-muted-fg">{a.clicks.toLocaleString()} total</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="kv-tabular text-right">
                    <p className="text-[13px] text-kv-fg">{a.sales.toLocaleString()}</p>
                    <p className="text-[11px] text-kv-muted-fg">{a.conversionRate.toFixed(1)}% conv.</p>
                  </TableCell>
                  <TableCell className="kv-tabular text-right">
                    <p className="text-[13px] font-medium text-kv-fg">{formatPrice(a.earned)}</p>
                    {a.unpaid > 0 ? (
                      <p className="text-[11px] text-kv-muted-fg">{formatPrice(a.unpaid)} unpaid</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[12px] text-kv-muted-fg">
                    {formatDate(a.joinedAt)}
                  </TableCell>
                  <TableCell className="pr-[14px] text-right">
                    <div className="flex items-center justify-end gap-[4px]">
                      {canManage && isPending ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => changeStatus(a, "ACTIVE")}
                          disabled={pending}
                        >
                          <CircleCheck /> Approve
                        </Button>
                      ) : null}
                      {canManage ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Actions for ${a.customer.name}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            {a.status === "ACTIVE" ? (
                              <>
                                <DropdownMenuItem
                                  onSelect={() => {
                                    copyLink(a.referralCode);
                                  }}
                                >
                                  <Copy /> Copy referral link
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={pending}
                                  onSelect={() => {
                                    regenerate(a.id);
                                  }}
                                >
                                  <RefreshCw /> Issue new code
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            ) : null}
                            {transitions.map((to) => {
                              const Icon = to === "ACTIVE" && a.status !== "PENDING" ? RotateCcw : ACTION_META[to].icon;
                              const destructive = to === "ARCHIVED" || to === "REJECTED";
                              return (
                                <DropdownMenuItem
                                  key={to}
                                  disabled={pending}
                                  className={destructive ? "text-red-600 focus:bg-red-50 focus:text-red-700" : undefined}
                                  onSelect={(e) => {
                                    if (to === "ARCHIVED" || to === "REJECTED") {
                                      // Keep focus handling sane while the confirm dialog opens.
                                      e.preventDefault();
                                      if (to === "ARCHIVED") setConfirmArchive(a);
                                      else {
                                        setSelected(new Set());
                                        setConfirmReject({ rows: [a] });
                                      }
                                    } else changeStatus(a, to);
                                  }}
                                >
                                  <Icon /> {actionLabel(a.status, to)}
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {matchingCount > 0 ? (
        <p className="kv-tabular border-t-[0.8px] border-kv-border px-[14px] py-[8px] text-[12px] text-kv-muted-fg">
          {matchingCount.toLocaleString()} {matchingCount === 1 ? "affiliate" : "affiliates"}
          {filters.status !== "ALL" ? ` · ${AFFILIATE_STATUS_LABEL[filters.status].toLowerCase()}` : ""}
          {filters.q ? ` · matching “${filters.q}”` : ""}
        </p>
      ) : null}

      <AlertDialog open={Boolean(confirmArchive)} onOpenChange={(o) => !o && setConfirmArchive(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {confirmArchive?.customer.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their referral link stops working immediately. Clicks, commissions, and payouts stay
              attached for audit history, and you can restore them from the Archived tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmArchive) changeStatus(confirmArchive, "ARCHIVED", undefined, () => setConfirmArchive(null));
              }}
              disabled={pending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {pending ? "Archiving…" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(confirmReject)}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmReject(null);
            setRejectReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmReject && confirmReject.rows.length > 1
                ? `Reject ${confirmReject.rows.length} applications?`
                : `Reject ${confirmReject?.rows[0]?.customer.name ?? "application"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              They won&apos;t get a referral link. You can still approve them later from the Rejected tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmReject && confirmReject.rows.length === 1 && selectedRows.length === 0 ? (
            <Textarea
              rows={2}
              maxLength={500}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Internal note (optional), e.g. audience doesn't match"
              aria-label="Rejection note"
            />
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                submitReject();
              }}
              disabled={pending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {pending ? "Rejecting…" : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
