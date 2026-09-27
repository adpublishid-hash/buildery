"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cloneWorkspaceAction } from "@/lib/actions/workspace-tools";

export function CloneWorkspaceForm({ workspaceId, workspaceName, workspaceSlug }: { workspaceId: string; workspaceName: string; workspaceSlug: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(false);
  if (!enabled) return <Button variant="outline" onClick={() => setEnabled(true)}><Copy /> Clone workspace</Button>;

  return (
    <form className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800" action={(formData) => startTransition(async () => {
      const result = await cloneWorkspaceAction(workspaceId, formData);
      if (!result.ok) { toast.error(result.error); return; }
      toast.success("Workspace berhasil di-clone");
      router.push(`/dashboard/workspaces/${result.workspaceId}`);
      router.refresh();
    })}>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="clone-name">Nama</Label><Input id="clone-name" name="name" defaultValue={`${workspaceName} Copy`} required /></div><div className="space-y-2"><Label htmlFor="clone-slug">Slug</Label><Input id="clone-slug" name="slug" defaultValue={`${workspaceSlug}-copy`} required /></div></div>
      <div className="flex flex-wrap gap-4 text-sm">{[["pages", "Pages & saved sections"], ["forms", "Forms (tanpa submission)"], ["store", "Store settings (tanpa credential)"]].map(([name, label]) => <label key={name} className="flex items-center gap-2"><input type="checkbox" name={name} value="true" defaultChecked /> {label}</label>)}</div>
      <div className="flex gap-2"><Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Copy />} Buat clone</Button><Button type="button" variant="ghost" onClick={() => setEnabled(false)} disabled={pending}>Batal</Button></div>
    </form>
  );
}
