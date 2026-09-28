"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addAffiliateAction } from "@/lib/actions/affiliate";

export function AddAffiliateButton({
  label = "Add affiliate",
  variant,
  commissionPercent,
}: {
  label?: string;
  variant?: ButtonProps["variant"];
  commissionPercent?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setErrors({});
      setServerError(null);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    setErrors({});
    const fd = new FormData();
    fd.set("name", form.name);
    fd.set("email", form.email);

    startTransition(async () => {
      const res = await addAffiliateAction(fd);
      if (!res.ok) {
        setServerError(res.error);
        if (res.fieldErrors) {
          const flat: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.fieldErrors)) {
            if (v?.[0]) flat[k] = v[0];
          }
          setErrors(flat);
        }
        return;
      }
      toast.success(`${form.name.trim() || "Affiliate"} added and activated`);
      setForm({ name: "", email: "" });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <UserPlus /> {label}
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add affiliate</DialogTitle>
            <DialogDescription>
              They&apos;re activated right away with a unique referral link
              {commissionPercent ? ` and earn ${commissionPercent}% on referred sales` : ""}.
              Existing customers are matched by email.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="a-name">Full name</Label>
              <Input
                id="a-name"
                autoFocus
                autoComplete="off"
                placeholder="Jane Doe"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name && <p className="text-xs text-kv-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="a-email">Email</Label>
              <Input
                id="a-email"
                type="email"
                autoComplete="off"
                placeholder="jane@example.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                aria-invalid={Boolean(errors.email)}
              />
              {errors.email && <p className="text-xs text-kv-destructive">{errors.email}</p>}
            </div>
            {serverError && !Object.keys(errors).length ? (
              <div role="alert" className="rounded-[8px] border-[0.8px] border-red-200 bg-red-50/70 px-[12px] py-[8px] text-[12px] text-red-700">
                {serverError}
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !form.name.trim() || !form.email.trim()}>
                {pending ? <Loader2 className="animate-spin" /> : <UserPlus />}
                Add affiliate
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
