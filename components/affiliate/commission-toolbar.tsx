"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { approveMatureCommissionsAction } from "@/lib/actions/affiliate";

export function CommissionToolbar({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <div className="mb-3 flex flex-wrap justify-end gap-2">
    <Button asChild variant="outline"><a href="/dashboard/affiliate/commissions/export"><Download /> Export CSV</a></Button>
    {canManage ? <Button type="button" onClick={() => startTransition(async () => {
      const result = await approveMatureCommissionsAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.data?.count ?? 0} commission(s) approved`);
      router.refresh();
    })} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <CheckCheck />}
      Approve eligible
    </Button> : null}
  </div>;
}
