"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function EnrollmentPaymentProofForm({ enrollmentId, accessToken, initialStatus }: { enrollmentId: string; accessToken: string; initialStatus: "NOT_SUBMITTED" | "PENDING" | "VERIFIED" | "REJECTED" }) {
  const [status, setStatus] = useState(initialStatus);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (status === "VERIFIED") return <p className="flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" />Payment verified.</p>;
  return <form className="space-y-3" onSubmit={async (event) => {
    event.preventDefault(); setPending(true); setError(null);
    const data = new FormData(event.currentTarget); data.set("accessToken", accessToken);
    const response = await fetch(`/api/site/enrollments/${enrollmentId}/payment-proof`, { method: "POST", body: data });
    const result = await response.json().catch(() => ({})); setPending(false);
    if (!response.ok) return setError(result.error ?? "Upload failed.");
    setStatus("PENDING");
  }}>
    <div className="space-y-1.5"><Label htmlFor="enrollment-proof">Transfer receipt</Label><Input id="enrollment-proof" name="file" type="file" accept="image/png,image/jpeg,image/webp" required disabled={pending} /></div>
    <div className="space-y-1.5"><Label htmlFor="enrollment-proof-note">Note (optional)</Label><Textarea id="enrollment-proof-note" name="note" maxLength={1000} rows={2} /></div>
    {status === "PENDING" ? <p className="text-xs text-amber-700">Your receipt is waiting for review. Upload again to replace it.</p> : null}
    {status === "REJECTED" ? <p className="text-xs text-red-700">The previous receipt was rejected. Please submit a valid receipt.</p> : null}
    {error ? <p className="text-xs text-red-700">{error}</p> : null}
    <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Upload />}{pending ? "Uploading" : "Submit receipt"}</Button>
  </form>;
}
