import { Suspense } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getCurrentWorkspace } from "@/lib/workspace";
import { Badge } from "@/components/ui/badge";
import { canInWorkspace, MEMBER_ROLE_LABEL } from "@/lib/permissions";
import { SettingsTabs } from "@/components/settings/settings-tabs";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const current = await getCurrentWorkspace(session.user.id);
  if (!current) redirect("/dashboard/workspaces/new");
  const canDelete = canInWorkspace(current.role, "workspace.delete");

  return (
    <div className="w-full min-w-0">
      <div className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-zinc-400">
            Pengaturan workspace
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {current.workspace.name}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Kelola tampilan workspace dan siapa saja yang bisa mengaksesnya.
          </p>
        </div>
        <Badge variant="outline">{MEMBER_ROLE_LABEL[current.role]}</Badge>
      </div>

      <div className="space-y-6">
        {/* useSearchParams needs a boundary; the bar is cheap enough to skip. */}
        <Suspense fallback={<div className="h-[52px] rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950" />}>
          <SettingsTabs canDelete={canDelete} />
        </Suspense>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
