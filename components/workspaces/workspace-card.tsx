"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MemberRole, Workspace } from "@prisma/client";
import { Activity, ArrowRight, RotateCcw, Star } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MEMBER_ROLE_LABEL } from "@/lib/permissions";
import { switchWorkspaceAction, toggleWorkspaceFavoriteAction } from "@/lib/actions/current-workspace";
import { restoreWorkspaceAction } from "@/lib/actions/workspace";
import { getInitials } from "@/lib/utils";

type Props = {
  workspace: Pick<
    Workspace,
    "id" | "name" | "slug" | "logoUrl" | "primaryColor" | "status" | "deleteAfter"
  >;
  role: MemberRole;
  isCurrent: boolean;
  memberCount: number;
  isFavorite: boolean;
};

export function WorkspaceCard({
  workspace,
  role,
  isCurrent,
  memberCount,
  isFavorite,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function open() {
    startTransition(async () => {
      const res = await switchWorkspaceAction(workspace.id);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  function restore() {
    startTransition(async () => {
      const res = await restoreWorkspaceAction(workspace.id);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Workspace dipulihkan");
      router.refresh();
    });
  }

  function favorite() {
    startTransition(async () => {
      const res = await toggleWorkspaceFavoriteAction(workspace.id);
      if ("error" in res) { toast.error(res.error); return; }
      router.refresh();
    });
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg text-xs font-semibold text-white"
            style={{ backgroundColor: workspace.primaryColor || "#18181b" }}
          >
            {workspace.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img loading="lazy" decoding="async"
                src={workspace.logoUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              getInitials(workspace.name)
            )}
          </span>
          <div className="min-w-0">
            <CardTitle className="truncate text-sm">{workspace.name}</CardTitle>
            <CardDescription className="truncate text-xs">
              /{workspace.slug}
            </CardDescription>
          </div>
        </div>
        <Badge variant={workspace.status === "ACTIVE" ? (isCurrent ? "success" : "secondary") : "outline"}>
          {workspace.status === "PENDING_DELETION" ? "Menunggu dihapus" : workspace.status === "SUSPENDED" ? "Ditangguhkan" : isCurrent ? "Current" : MEMBER_ROLE_LABEL[role]}
        </Badge>
      </CardHeader>
      <CardContent className="mt-auto flex items-center justify-between border-t border-zinc-200/70 pt-4 dark:border-zinc-800">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {memberCount} member{memberCount === 1 ? "" : "s"} · {MEMBER_ROLE_LABEL[role]}
        </span>
        <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" onClick={favorite} disabled={pending} aria-label={isFavorite ? "Hapus dari favorit" : "Tambahkan ke favorit"}><Star className={isFavorite ? "fill-current" : ""} /></Button>
        {workspace.status === "PENDING_DELETION" && role === "OWNER" ? (
          <Button size="sm" variant="outline" onClick={restore} disabled={pending}><RotateCcw /> Pulihkan</Button>
        ) : workspace.status !== "ACTIVE" ? null : isCurrent ? (
          <Button asChild size="sm" variant="ghost">
            <Link href={`/dashboard/workspaces/${workspace.id}`}>
              Health <Activity />
            </Link>
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={open} disabled={pending}>
            {pending ? "Opening…" : "Open"} <ArrowRight />
          </Button>
        )}
        </div>
      </CardContent>
    </Card>
  );
}
