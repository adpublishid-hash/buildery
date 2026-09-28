"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { approveMatureCommissionsAction } from "@/lib/actions/affiliate";

export function CommissionToolbar({ canManage, readyCount = 0 }: { canManage: boolean; readyCount?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <div className="flex flex-wrap justify-end gap-2">
    <Button asChild variant="outline"><a href="/dashboard/affiliate/commissions/export"><Download /> Export CSV</a></Button>
    {canManage ? <Button type="button" title={readyCount ? undefined : "No pending commission has passed its refund hold yet."} onClick={() => startTransition(async () => {
      const result = await approveMatureCommissionsAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const count = result.data?.count ?? 0;
      toast.success(count ? `${count} ${count === 1 ? "commission" : "commissions"} approved` : "Nothing to approve yet");
      router.refresh();
    })} disabled={pending || readyCount === 0}>
      {pending ? <Loader2 className="animate-spin" /> : <CheckCheck />}
      Approve eligible{readyCount ? ` (${readyCount})` : ""}
    </Button> : null}
  </div>;
}
