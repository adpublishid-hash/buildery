"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Role, SaaSPlanTier } from "@prisma/client";
import { CreditCard, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteUserAction,
  setUserPlanAction,
  setUserRoleAction,
  restoreUserAction,
} from "@/lib/actions/admin";
import { ROLE_LABEL, ROLES } from "@/lib/permissions";
import { formatPrice } from "@/lib/utils";

type PlanOption = {
  id: string;
  name: string;
  tier: SaaSPlanTier;
  monthlyPrice: number;
};

type Props = {
  userId: string;
  userEmail: string;
  role: Role;
  isSelf: boolean;
  isPlatformSuperAdmin: boolean;
  currentPlanTier: SaaSPlanTier;
  plans: PlanOption[];
  isQuarantined: boolean;
};

export function UserRowActions({
  userId,
  userEmail,
  role,
  isSelf,
  isPlatformSuperAdmin,
  currentPlanTier,
  plans,
  isQuarantined,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const roleOptions = isPlatformSuperAdmin
    ? []
    : ROLES.filter((r) => r !== role && r !== "SUPER_ADMIN");
  const deleteDisabled = isSelf || isPlatformSuperAdmin;

  function changeRole(next: Role) {
    startTransition(async () => {
      const res = await setUserRoleAction(userId, next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Role set to ${ROLE_LABEL[next]}`);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteUserAction(userId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("User dikarantina selama 30 hari");
      setConfirmOpen(false);
      router.refresh();
    });
  }

  function restore() {
    startTransition(async () => {
      const res = await restoreUserAction(userId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("User dipulihkan");
      router.refresh();
    });
  }

  function changePlan(next: SaaSPlanTier) {
    if (next === currentPlanTier) return;
    startTransition(async () => {
      const res = await setUserPlanAction(userId, next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const planName = plans.find((plan) => plan.tier === next)?.name ?? next;
      toast.success(`${userEmail} upgraded to ${planName}`);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="User actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-zinc-400">
            Set role
          </DropdownMenuLabel>
          {roleOptions.length > 0 ? (
            roleOptions.map((r) => (
              <DropdownMenuItem
                key={r}
                disabled={pending}
                onSelect={(e) => {
                  e.preventDefault();
                  changeRole(r);
                }}
              >
                {ROLE_LABEL[r]}
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem
              disabled
              onSelect={(e) => {
                e.preventDefault();
              }}
            >
              Platform admin locked
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <CreditCard className="h-4 w-4" />
              Set plan
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              {plans.map((plan) => (
                <DropdownMenuItem
                  key={plan.id}
                  disabled={pending || plan.tier === currentPlanTier}
                  onSelect={(e) => {
                    e.preventDefault();
                    changePlan(plan.tier);
                  }}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{plan.name}</span>
                    <span className="truncate text-xs text-zinc-400">
                      {plan.monthlyPrice === 0
                        ? "Gratis"
                        : `${formatPrice(plan.monthlyPrice)}/bulan`}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          {isQuarantined ? (
            <DropdownMenuItem disabled={pending} onSelect={(e) => { e.preventDefault(); restore(); }}>
              <RotateCcw /> Pulihkan user
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            disabled={deleteDisabled || isQuarantined}
            onSelect={(e) => {
              e.preventDefault();
              if (!deleteDisabled) setConfirmOpen(true);
            }}
            className="text-red-600 focus:bg-red-50 focus:text-red-700"
          >
            <Trash2 /> Karantina user
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Karantina {userEmail}?</AlertDialogTitle>
            <AlertDialogDescription>
              Akses dihentikan sekarang dan data dijadwalkan dihapus setelah 30 hari. Ketik email user untuk mengonfirmasi.
            </AlertDialogDescription>
            <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={userEmail} autoComplete="off" />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                remove();
              }}
              disabled={pending || confirmation !== userEmail}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {pending ? "Memproses..." : "Karantina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
