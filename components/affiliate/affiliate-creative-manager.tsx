"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createAffiliateCreativeAction, deleteAffiliateCreativeAction } from "@/lib/actions/affiliate";

type Creative = { id: string; title: string; type: "LINK" | "IMAGE" | "COPY"; content: string; targetUrl: string | null };

export function AffiliateCreativeManager({ creatives }: { creatives: Creative[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState({ title: "", type: "LINK", content: "", targetUrl: "" });
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const data = new FormData();
    Object.entries(values).forEach(([key, value]) => data.set(key, value));
    startTransition(async () => {
      const result = await createAffiliateCreativeAction(data);
      if (!result.ok) { toast.error(result.error); return; }
      setValues({ title: "", type: "LINK", content: "", targetUrl: "" });
      toast.success("Affiliate resource added");
      router.refresh();
    });
  }
  return <div className="space-y-5">
    {creatives.length ? <div className="divide-y divide-kv-border rounded-lg border border-kv-border">{creatives.map((creative) => <div key={creative.id} className="flex items-start justify-between gap-4 p-3"><div className="min-w-0"><p className="text-sm font-medium">{creative.title}</p><p className="truncate text-xs text-kv-muted-fg">{creative.type} · {creative.content}</p></div><Button size="icon" variant="ghost" title="Delete resource" onClick={() => startTransition(async () => { const result = await deleteAffiliateCreativeAction(creative.id); if (!result.ok) toast.error(result.error); else router.refresh(); })}><Trash2 /></Button></div>)}</div> : <p className="text-sm text-kv-muted-fg">No campaign resources yet.</p>}
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="creative-title">Title</Label><Input id="creative-title" value={values.title} onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))} /></div>
      <div className="space-y-2"><Label>Type</Label><Select value={values.type} onValueChange={(type) => setValues((current) => ({ ...current, type }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="LINK">Link</SelectItem><SelectItem value="IMAGE">Image</SelectItem><SelectItem value="COPY">Copy</SelectItem></SelectContent></Select></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="creative-content">URL or copy</Label><Textarea id="creative-content" rows={3} value={values.content} onChange={(event) => setValues((current) => ({ ...current, content: event.target.value }))} /></div>
      <div className="space-y-2"><Label htmlFor="creative-target">Optional target URL</Label><Input id="creative-target" value={values.targetUrl} onChange={(event) => setValues((current) => ({ ...current, targetUrl: event.target.value }))} /></div>
      <div className="flex items-end justify-end"><Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Plus />} Add resource</Button></div>
    </form>
  </div>;
}
