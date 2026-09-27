"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { MemberRole } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { leaveWorkspaceAction, transferWorkspaceOwnershipAction } from "@/lib/actions/members";

type Candidate = { id: string; label: string };

export function WorkspaceGovernance({ workspaceId, role, candidates }: { workspaceId: string; role: MemberRole; candidates: Candidate[] }) {
  const router = useRouter();
  const [memberId, setMemberId] = useState("");
  const [pending, startTransition] = useTransition();

  function transfer() {
    if (!memberId || !window.confirm("Pindahkan kepemilikan workspace? Anda akan menjadi Admin.")) return;
    startTransition(async () => {
      const result = await transferWorkspaceOwnershipAction(workspaceId, memberId);
      if (!result.ok) { toast.error(result.error); return; }
      toast.success("Kepemilikan workspace dipindahkan");
      router.refresh();
    });
  }

  function leave() {
    if (!window.confirm("Keluar dari workspace ini?")) return;
    startTransition(async () => {
      const result = await leaveWorkspaceAction(workspaceId);
      if (!result.ok) { toast.error(result.error); return; }
      toast.success("Anda telah keluar dari workspace");
      router.push("/dashboard/workspaces");
      router.refresh();
    });
  }

  return (
    <div className="border-t border-zinc-200 pt-5 dark:border-zinc-800">
      {role === "OWNER" ? (
        <div className="space-y-3">
          <div><p className="text-sm font-medium">Pindahkan kepemilikan</p><p className="text-xs text-zinc-500">Pemilik baru mendapat kontrol penuh dan Anda menjadi Admin.</p></div>
          {candidates.length ? <div className="flex flex-col gap-2 sm:flex-row"><div className="min-w-0 flex-1"><Label className="sr-only">Pemilik baru</Label><Select value={memberId} onValueChange={setMemberId}><SelectTrigger><SelectValue placeholder="Pilih anggota" /></SelectTrigger><SelectContent>{candidates.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.label}</SelectItem>)}</SelectContent></Select></div><Button variant="outline" onClick={transfer} disabled={!memberId || pending}>{pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Pindahkan</Button></div> : <p className="text-xs text-zinc-500">Tambahkan anggota sebelum memindahkan kepemilikan.</p>}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium">Keluar dari workspace</p><p className="text-xs text-zinc-500">Akses Anda akan langsung dicabut.</p></div><Button variant="outline" onClick={leave} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <LogOut />} Keluar</Button></div>
      )}
    </div>
  );
}
