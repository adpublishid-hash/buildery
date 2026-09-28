import Link from "next/link";
import type { MemberRole, Role, Workspace } from "@prisma/client";

import { BrandLogo } from "@/components/brand-logo";

import { SidebarNav } from "./sidebar-nav";
import { SidebarAccount, SidebarCollapseButton, SidebarSearch } from "./sidebar-parts";
import {
  WorkspaceSwitcher,
  type WorkspaceOption,
} from "./workspace-switcher";

type Props = {
  role: Role;
  workspaces: WorkspaceOption[];
  currentWorkspace: Pick<Workspace, "id" | "name" | "slug" | "logoUrl"> | null;
  currentMemberRole?: MemberRole;
  userName?: string | null;
  userEmail?: string | null;
  userImage?: string | null;
  badges?: Record<string, number>;
};

/**
 * The dashboard sidebar. Rendered once and shown both docked (desktop) and in
 * the drawer (mobile) by <DashboardShell>, so it holds no layout state itself.
 */
export function Sidebar({
  role,
  workspaces,
  currentWorkspace,
  currentMemberRole,
  userName,
  userEmail,
  userImage,
  badges,
}: Props) {
  return (
    <aside className="flex h-full w-[250px] shrink-0 flex-col" aria-label="Main">
      <div className="flex w-[250px] items-center justify-between overflow-clip px-[12px] py-[12px]">
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-[12px] rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-kv-ring/40"
        >
          <BrandLogo className="truncate text-[18px]" />
        </Link>
        <SidebarCollapseButton />
      </div>

      <div className="flex min-h-0 w-[250px] flex-1 flex-col gap-[10px] px-[12px] pb-[12px]">
        <div className="h-px w-full shrink-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.1)_50%,transparent_0)] bg-[length:8px_1px]" />

        <WorkspaceSwitcher
          current={currentWorkspace}
          currentRole={currentMemberRole}
          options={workspaces}
        />

        <SidebarSearch />

        <SidebarNav role={role} badges={badges} />

        <SidebarAccount
          name={userName}
          email={userEmail}
          image={userImage}
          role={role}
        />
      </div>
    </aside>
  );
}
