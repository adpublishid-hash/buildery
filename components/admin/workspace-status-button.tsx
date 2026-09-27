"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CirclePause, CirclePlay, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { WorkspaceStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { restoreWorkspaceAdminAction, setWorkspaceStatusAdminAction } from "@/lib/actions/admin";

export function WorkspaceStatusButton({ workspaceId, status }: { workspaceId: string; status: WorkspaceStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (status === "PENDING_DELETION") return <Button variant="ghost" size="icon" disabled={pending} aria-label="Restore workspace" onClick={() => startTransition(async () => { const result = await restoreWorkspaceAdminAction(workspaceId); if (!result.ok) { toast.error(result.error); return; } toast.success("Workspace dipulihkan"); router.refresh(); })}>{pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}</Button>;
  const next = status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
  return <Button variant="ghost" size="icon" disabled={pending} aria-label={next === "SUSPENDED" ? "Suspend workspace" : "Activate workspace"} onClick={() => startTransition(async () => { const result = await setWorkspaceStatusAdminAction(workspaceId, next); if (!result.ok) { toast.error(result.error); return; } toast.success(next === "SUSPENDED" ? "Workspace suspended" : "Workspace activated"); router.refresh(); })}>{pending ? <Loader2 className="animate-spin" /> : next === "SUSPENDED" ? <CirclePause /> : <CirclePlay />}</Button>;
}
