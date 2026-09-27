"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { logoutMemberAction } from "@/lib/actions/member-auth";
import { publicSiteHref } from "@/lib/public-url";

export function MemberLogoutButton({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function logout() {
    startTransition(async () => {
      await logoutMemberAction(workspaceSlug);
      router.push(publicSiteHref(workspaceSlug, "memberships"));
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="outline" onClick={logout} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <LogOut />}
      Log out
    </Button>
  );
}
