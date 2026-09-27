"use client";

import { useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { moderateProductReviewAction } from "@/lib/actions/product-engagement";

type Review = { id: string; status: string; rating: number; title: string | null; body: string | null; customerName: string; createdAt: Date };
export function ProductReviewsPanel({ reviews }: { reviews: Review[] }) {
  const [pending, startTransition] = useTransition();
  const moderate = (id: string, status: "PUBLISHED" | "REJECTED") => startTransition(async () => { const result = await moderateProductReviewAction(id, status); if (!result.ok) toast.error(result.error); else toast.success("Status ulasan diperbarui"); });
  return <Card><CardHeader><CardTitle>Ulasan produk</CardTitle></CardHeader><CardContent>{reviews.length === 0 ? <p className="text-sm text-zinc-500">Belum ada ulasan.</p> : <div className="space-y-3">{reviews.map((review) => <article key={review.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{review.customerName} · {review.rating}/5</p><p className="text-xs uppercase text-zinc-500">{review.status.toLowerCase()}</p></div>{review.status === "PENDING" ? <div className="flex gap-1"><Button size="icon" variant="outline" disabled={pending} onClick={() => moderate(review.id, "PUBLISHED")} aria-label="Publish review">{pending ? <Loader2 className="animate-spin" /> : <Check />}</Button><Button size="icon" variant="outline" disabled={pending} onClick={() => moderate(review.id, "REJECTED")} aria-label="Reject review"><X /></Button></div> : null}</div>{review.title ? <p className="mt-2 text-sm font-medium">{review.title}</p> : null}{review.body ? <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{review.body}</p> : null}</article>)}</div>}</CardContent></Card>;
}
