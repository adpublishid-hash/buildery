"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MembershipPlan } from "@prisma/client";
import {
  Archive,
  ArchiveRestore,
  Copy,
  CreditCard,
  Crown,
  Gift,
  Link2,
  MoreHorizontal,
  PenSquare,
  Plus,
  Sparkles,
  Users,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { TabBar } from "@/components/ui/tab-bar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Panel } from "@/components/dashboard/panel";
import {
  deleteMembershipPlanAction,
  duplicateMembershipPlanAction,
  restoreMembershipPlanAction,
  setMembershipPlanActiveAction,
} from "@/lib/actions/membership";
import { MEMBERSHIP_LEVEL_LABEL } from "@/lib/labels";
import { planState, type PlanState } from "@/lib/membership-dashboard";
import { cn, formatPrice } from "@/lib/utils";

import { PlanDialog, type PlanDialogValues } from "./plan-dialog";

type Row = MembershipPlan & {
  memberCount: number;
  activeMemberCount: number;
  product?: { name: string; price: number; type: string } | null;
};

type Filter = "ALL" | PlanState;

function rowDefaults(p: MembershipPlan): PlanDialogValues {
  return {
    name: p.name,
    slug: p.slug,
    description: p.description ?? "",
    level: p.level,
    price: String(p.price),
    accessDays: String(p.accessDays),
    isActive: p.isActive ? "true" : "false",
    productId: p.productId ?? "",
    benefits: Array.isArray(p.benefits) ? p.benefits.filter((item): item is string => typeof item === "string").join("\n") : "",
    recommended: p.recommended ? "true" : "false",
    ctaLabel: p.ctaLabel ?? "",
    sortOrder: String(p.sortOrder),
  };
}

function emptyDefaults(): PlanDialogValues {
  return {
    name: "",
    slug: "",
    description: "",
    level: "BASIC",
    price: "0",
    accessDays: "0",
    isActive: "true",
    productId: "",
    benefits: "",
    recommended: "false",
    ctaLabel: "",
    sortOrder: "0",
  };
}

const TEMPLATES: {
  key: string;
  icon: typeof Gift;
  title: string;
  blurb: string;
  values: Partial<PlanDialogValues>;
}[] = [
  {
    key: "free",
    icon: Gift,
    title: "Free community",
    blurb: "Free, lifetime access. Grows your list of members.",
    values: {
      name: "Free Member",
      slug: "free-member",
      level: "FREE",
      price: "0",
      accessDays: "0",
      benefits: "Member newsletter\nFree resources\nCommunity access",
      ctaLabel: "Join free",
      sortOrder: "0",
    },
  },
  {
    key: "monthly",
    icon: CreditCard,
    title: "Monthly pass",
    blurb: "Basic tier, 30 days of access per purchase.",
    values: {
      name: "Monthly",
      slug: "monthly",
      level: "BASIC",
      price: "99000",
      accessDays: "30",
      benefits: "All Basic courses\nMember-only content\nEmail support",
      ctaLabel: "Get monthly access",
      sortOrder: "1",
    },
  },
  {
    key: "premium",
    icon: Crown,
    title: "Premium yearly",
    blurb: "Premium tier for 365 days, marked as recommended.",
    values: {
      name: "Premium Yearly",
      slug: "premium-yearly",
      level: "PREMIUM",
      price: "999000",
      accessDays: "365",
      recommended: "true",
      benefits: "Every course, including Premium\nPriority support\nLive sessions",
      ctaLabel: "Go Premium",
      sortOrder: "2",
    },
  },
];

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "INACTIVE", label: "Inactive" },
  { key: "ARCHIVED", label: "Archived" },
];

function accessLabel(days: number) {
  if (days === 0) return "Lifetime";
  if (days % 365 === 0) return days === 365 ? "1 year" : `${days / 365} years`;
  if (days === 30 || days === 31) return "1 month";
  return `${days} days`;
}

export function PlansTable({
  plans,
  products = [],
  publicUrl,
}: {
  plans: Row[];
  products?: { id: string; name: string; price: number; type: string }[];
  /** Public memberships page; each plan anchors at `#plan-<slug>`. */
  publicUrl: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [dialog, setDialog] = useState<{
    open: boolean;
    mode: "create" | "edit";
    planId?: string;
    archived?: boolean;
    defaultValues: PlanDialogValues;
  }>({ open: false, mode: "create", defaultValues: emptyDefaults() });
  const [confirmArchive, setConfirmArchive] = useState<Row | null>(null);

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { ALL: 0, ACTIVE: 0, INACTIVE: 0, ARCHIVED: 0 };
    for (const plan of plans) {
      const state = planState(plan);
      result[state] += 1;
      if (state !== "ARCHIVED") result.ALL += 1;
    }
    return result;
  }, [plans]);
  const visible = plans.filter((plan) => {
    const state = planState(plan);
    return filter === "ALL" ? state !== "ARCHIVED" : state === filter;
  });

  function openCreate(values?: Partial<PlanDialogValues>) {
    const taken = new Set(plans.map((plan) => plan.slug));
    const base = { ...emptyDefaults(), ...values };
    // Templates carry a fixed slug; keep it unique so the first save works.
    if (base.slug && taken.has(base.slug)) {
      let n = 2;
      while (taken.has(`${base.slug}-${n}`)) n += 1;
      base.slug = `${base.slug}-${n}`;
    }
    setDialog({ open: true, mode: "create", defaultValues: base });
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

  function copyPlanLink(slug: string) {
    const base = publicUrl.startsWith("/") ? `${window.location.origin}${publicUrl}` : publicUrl;
    navigator.clipboard
      ?.writeText(`${base}#plan-${slug}`)
      .then(() => toast.success("Plan link copied"))
      .catch(() => toast.error("Could not copy"));
  }

  const newPlanButton = (
    <Button size="sm" onClick={() => openCreate()}>
      <Plus /> New plan
    </Button>
  );

  return (
    <>
      <Panel title="Plans" icon={CreditCard} action={newPlanButton}>
        {counts.ALL === 0 && counts.ARCHIVED === 0 ? (
          <div className="flex flex-col items-center px-[16px] py-[36px] text-center">
            <div className="mb-[10px] flex items-center rounded-[8px] border-[0.8px] border-kv-input bg-kv-card p-[8px] text-kv-secondary-fg">
              <Sparkles className="h-[16px] w-[16px]" strokeWidth={1.6} />
            </div>
            <h3 className="text-[14px] font-semibold text-kv-fg">Create your first plan</h3>
            <p className="mt-[4px] max-w-md text-[12px] leading-[1.5] text-kv-muted-fg">
              A plan sells access to a level (Free, Basic, or Premium) for a set time. Courses gated at
              that level unlock for members. Start from a template and adjust anything.
            </p>
            <div className="mt-[18px] grid w-full max-w-[760px] grid-cols-1 gap-[8px] sm:grid-cols-3">
              {TEMPLATES.map((template) => {
                const Icon = template.icon;
                return (
                  <button
                    key={template.key}
                    type="button"
                    onClick={() => openCreate(template.values)}
                    className="group flex flex-col items-start gap-[6px] rounded-[10px] border-[0.8px] border-kv-border bg-kv-card p-[14px] text-left transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-px hover:border-[#d1d5db] hover:shadow-kv-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-kv-ring/40"
                  >
                    <span className="flex h-[28px] w-[28px] items-center justify-center rounded-[8px] bg-kv-secondary text-kv-secondary-fg">
                      <Icon className="h-[14px] w-[14px]" />
                    </span>
                    <span className="text-[13px] font-medium text-kv-fg">{template.title}</span>
                    <span className="text-[12px] leading-[1.45] text-kv-muted-fg">{template.blurb}</span>
                    <span className="kv-tabular mt-[2px] text-[12px] font-medium text-kv-secondary-fg">
                      {Number(template.values.price) > 0 ? formatPrice(Number(template.values.price)) : "Free"}
                      <span className="font-normal text-kv-muted-fg">
                        {" "}· {accessLabel(Number(template.values.accessDays))}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <Button variant="link" size="sm" className="mt-[10px]" onClick={() => openCreate()}>
              or start from scratch
            </Button>
          </div>
        ) : (
          <>
            <div className="border-b-[0.8px] border-kv-border p-[10px]">
              <TabBar
                ariaLabel="Filter plans"
                active={filter}
                onSelect={(key) => setFilter(key as Filter)}
                items={FILTERS.map((item) => ({ ...item, count: counts[item.key] }))}
              />
            </div>
            {visible.length === 0 ? (
              <p className="px-[16px] py-[36px] text-center text-[12px] text-kv-muted-fg">
                {filter === "ARCHIVED" ? "No archived plans." : "No plans in this view."}
              </p>
            ) : (
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-[14px]">Plan</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Access</TableHead>
                    <TableHead className="text-right">Members</TableHead>
                    <TableHead>Linked product</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead className="w-[1%] pr-[14px] text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((p) => {
                    const state = planState(p);
                    const archived = state === "ARCHIVED";
                    return (
                      <TableRow key={p.id} className={cn(archived && "opacity-70")}>
                        <TableCell className="pl-[14px]">
                          <button
                            type="button"
                            className="group text-left"
                            onClick={() =>
                              setDialog({ open: true, mode: "edit", planId: p.id, archived, defaultValues: rowDefaults(p) })
                            }
                          >
                            <span className="flex items-center gap-[6px] text-[13px] font-medium text-kv-fg group-hover:underline">
                              {p.name}
                              {p.recommended ? (
                                <Badge variant="secondary" className="h-[18px] px-[6px] text-[10px]">
                                  Recommended
                                </Badge>
                              ) : null}
                            </span>
                            <span className="block truncate font-mono text-[11px] text-kv-muted-fg">/{p.slug}</span>
                          </button>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{MEMBERSHIP_LEVEL_LABEL[p.level]}</Badge>
                        </TableCell>
                        <TableCell className="kv-tabular text-right text-[13px] font-medium text-kv-fg">
                          {p.price === 0 ? "Free" : formatPrice(p.price)}
                        </TableCell>
                        <TableCell className="text-[12px] text-kv-secondary-fg">{accessLabel(p.accessDays)}</TableCell>
                        <TableCell className="kv-tabular text-right">
                          <Link
                            href={`/dashboard/membership/members?plan=${p.id}`}
                            className="text-[13px] text-kv-fg hover:underline"
                            title="View members"
                          >
                            {p.activeMemberCount.toLocaleString()} active
                          </Link>
                          {p.memberCount !== p.activeMemberCount ? (
                            <p className="text-[11px] text-kv-muted-fg">{p.memberCount.toLocaleString()} all-time</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate text-[12px] text-kv-muted-fg">
                          {p.product ? p.product.name : "—"}
                        </TableCell>
                        <TableCell>
                          {archived ? (
                            <Badge variant="success" className="before:bg-kv-subtle">Archived</Badge>
                          ) : (
                            <div className="flex items-center gap-[8px]">
                              <Switch
                                checked={p.isActive}
                                disabled={pending}
                                aria-label={p.isActive ? `Unpublish ${p.name}` : `Publish ${p.name}`}
                                onCheckedChange={(next) =>
                                  run(
                                    () => setMembershipPlanActiveAction(p.id, next),
                                    next ? `${p.name} is live on your membership page` : `${p.name} hidden from signup`
                                  )
                                }
                              />
                              <span className="text-[12px] text-kv-muted-fg">{p.isActive ? "Live" : "Hidden"}</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="pr-[14px] text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Actions for ${p.name}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault();
                                  setDialog({ open: true, mode: "edit", planId: p.id, archived, defaultValues: rowDefaults(p) });
                                }}
                              >
                                <PenSquare /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={pending}
                                onSelect={() => {
                                  run(() => duplicateMembershipPlanAction(p.id), `Copied as a hidden draft`);
                                }}
                              >
                                <Copy /> Duplicate
                              </DropdownMenuItem>
                              {state === "ACTIVE" ? (
                                <DropdownMenuItem
                                  onSelect={() => {
                                    copyPlanLink(p.slug);
                                  }}
                                >
                                  <Link2 /> Copy plan link
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem asChild>
                                <Link href={`/dashboard/membership/members?plan=${p.id}`}>
                                  <Users /> View members
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {archived ? (
                                <DropdownMenuItem
                                  disabled={pending}
                                  onSelect={() => {
                                    run(() => restoreMembershipPlanAction(p.id), `${p.name} restored as hidden`);
                                  }}
                                >
                                  <ArchiveRestore /> Restore
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onSelect={(e) => {
                                    e.preventDefault();
                                    setConfirmArchive(p);
                                  }}
                                  className="text-red-600 focus:bg-red-50 focus:text-red-700"
                                >
                                  <Archive /> Archive
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </Panel>

      <PlanDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        mode={dialog.mode}
        planId={dialog.planId}
        archived={dialog.archived}
        defaultValues={dialog.defaultValues}
        products={products}
      />

      <AlertDialog open={Boolean(confirmArchive)} onOpenChange={(o) => !o && setConfirmArchive(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive &ldquo;{confirmArchive?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              The plan disappears from signup.{" "}
              {confirmArchive?.activeMemberCount
                ? `Its ${confirmArchive.activeMemberCount} active ${confirmArchive.activeMemberCount === 1 ? "member keeps" : "members keep"} access until their period ends. `
                : ""}
              Payments and history stay intact, and you can restore it from the Archived tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmArchive)
                  run(() => deleteMembershipPlanAction(confirmArchive.id), "Plan archived", () => setConfirmArchive(null));
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
