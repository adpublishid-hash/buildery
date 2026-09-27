"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Save, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  cancelMemberAccessAction,
  changeMemberPasswordAction,
  updateMemberProfileAction,
} from "@/lib/actions/member-account";

export function MemberAccountControls({
  workspaceSlug,
  name,
  phone,
}: {
  workspaceSlug: string;
  name: string;
  phone: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [profile, setProfile] = useState({ name, phone: phone ?? "" });

  function saveProfile(formData: FormData) {
    startTransition(async () => {
      const result = await updateMemberProfileAction(workspaceSlug, formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Profile updated");
      router.refresh();
    });
  }

  function changePassword(formData: FormData) {
    startTransition(async () => {
      const result = await changeMemberPasswordAction(workspaceSlug, formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Password updated. Other sessions were signed out.");
      router.refresh();
    });
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
        <CardContent>
          <form action={saveProfile} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="account-name">Name</Label><Input id="account-name" name="name" value={profile.name} onChange={(event) => setProfile((value) => ({ ...value, name: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="account-phone">Phone</Label><Input id="account-phone" name="phone" value={profile.phone} onChange={(event) => setProfile((value) => ({ ...value, phone: event.target.value }))} /></div>
            <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />} Save profile</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Password</CardTitle></CardHeader>
        <CardContent>
          <form action={changePassword} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="current-password">Current password</Label><Input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required /></div>
            <div className="space-y-2"><Label htmlFor="new-password">New password</Label><Input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} required /></div>
            <Button type="submit" variant="outline" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <KeyRound />} Change password</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function CancelMembershipButton({
  workspaceSlug,
  membershipId,
  timed,
}: {
  workspaceSlug: string;
  membershipId: string;
  timed: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(timed ? "Cancel renewal and keep access until the end date?" : "Cancel this lifetime access now?")) return;
        startTransition(async () => {
          const result = await cancelMemberAccessAction(workspaceSlug, membershipId);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(timed ? "Cancellation scheduled" : "Access cancelled");
          router.refresh();
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <XCircle />}
      Cancel
    </Button>
  );
}
