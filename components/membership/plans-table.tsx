"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MembershipPlan } from "@prisma/client";
import {
  MoreHorizontal,
  PenSquare,
  Plus,
  Trash2,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteMembershipPlanAction } from "@/lib/actions/membership";
import { MEMBERSHIP_LEVEL_LABEL } from "@/lib/labels";
import { formatPrice } from "@/lib/utils";

import { PlanDialog, type PlanDialogValues } from "./plan-dialog";

type Row = MembershipPlan & {
  memberCount: number;
  product?: { name: string; price: number; type: string } | null;
};

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

export function PlansTable({
  plans,
  products = [],
}: {
  plans: Row[];
  products?: { id: string; name: string; price: number; type: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{
    open: boolean;
    mode: "create" | "edit";
    planId?: string;
    defaultValues: PlanDialogValues;
  }>({ open: false, mode: "create", defaultValues: emptyDefaults() });
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);

  function remove() {
    if (!confirmDelete) return;
    startTransition(async () => {
      const res = await deleteMembershipPlanAction(confirmDelete.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Plan archived");
      setConfirmDelete(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex justify-end pb-3">
        <Button
          onClick={() =>
            setDialog({
              open: true,
              mode: "create",
              defaultValues: emptyDefaults(),
            })
          }
        >
          <Plus /> New plan
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Plan</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Linked product</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12 pr-4 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.filter((p) => !p.archivedAt).map((p) => (
              <TableRow key={p.id}>
                <TableCell className="pl-4">
                  <p className="text-sm font-medium text-zinc-900">{p.name}</p>
                  <p className="truncate text-xs text-zinc-500">/{p.slug}</p>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {MEMBERSHIP_LEVEL_LABEL[p.level]}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-zinc-700">
                  {p.price === 0 ? "Free" : formatPrice(p.price)}
                </TableCell>
                <TableCell className="text-sm text-zinc-500">
                  {p.product ? p.product.name : "Tier gratis"}
                </TableCell>
                <TableCell className="text-sm text-zinc-500">
                  {p.accessDays === 0 ? "Lifetime" : `${p.accessDays} days`}
                </TableCell>
                <TableCell className="text-sm text-zinc-500">
                  {p.memberCount}
                </TableCell>
                <TableCell>
                  <Badge variant={p.isActive ? "success" : "outline"}>
                    {p.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Plan actions"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          setDialog({
                            open: true,
                            mode: "edit",
                            planId: p.id,
                            defaultValues: rowDefaults(p),
                          });
                        }}
                      >
                        <PenSquare /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          setConfirmDelete(p);
                        }}
                        className="text-red-600 focus:bg-red-50 focus:text-red-700"
                      >
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <PlanDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        mode={dialog.mode}
        planId={dialog.planId}
        defaultValues={dialog.defaultValues}
        products={products}
      />

      <AlertDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Archive plan &ldquo;{confirmDelete?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The plan disappears from signup, while members, payments, and audit history remain intact.
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
