"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Heart, Loader2, Star } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitProductReviewAction, toggleWishlistAction } from "@/lib/actions/product-engagement";
import { publicSiteHref } from "@/lib/public-url";
import { trackAdEvent } from "@/lib/meta-client";

export function ProductEngagement({ workspaceId, workspaceSlug, productId, member, wishlisted, reviewOrderItemId }: { workspaceId: string; workspaceSlug: string; productId: string; member: boolean; wishlisted: boolean; reviewOrderItemId: string | null }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-3 space-y-3">
      {member ? <Button type="button" variant="outline" className="w-full" disabled={pending} onClick={() => startTransition(async () => { const result = await toggleWishlistAction(workspaceSlug, productId); if (!result.ok) toast.error(result.error); else { toast.success(result.active ? "Disimpan ke wishlist" : "Dihapus dari wishlist"); if (result.adEventId) trackAdEvent({ workspaceId, eventName: "AddToWishlist", eventId: result.adEventId, customData: result.adCustomData, sendServer: false }); } })}>{pending ? <Loader2 className="animate-spin" /> : <Heart className={wishlisted ? "fill-current" : ""} />} {wishlisted ? "Tersimpan" : "Simpan ke wishlist"}</Button> : <Button asChild variant="outline" className="w-full"><Link href={`${publicSiteHref(workspaceSlug, "member/login")}?callbackUrl=${encodeURIComponent(publicSiteHref(workspaceSlug, `products`))}`}><Heart /> Login untuk wishlist</Link></Button>}
      {reviewOrderItemId ? <form action={(formData) => startTransition(async () => { const result = await submitProductReviewAction(workspaceSlug, productId, reviewOrderItemId, formData); if (!result.ok) toast.error(result.error); else toast.success("Ulasan dikirim untuk moderasi"); })} className="space-y-2 rounded-lg border border-zinc-200 p-3"><p className="text-sm font-semibold">Ulas produk ini</p><label className="flex items-center gap-2 text-xs"><Star className="h-4 w-4" /><select name="rating" className="h-9 flex-1 rounded-md border border-zinc-200 px-2" defaultValue="5">{[5,4,3,2,1].map((rating) => <option key={rating} value={rating}>{rating} bintang</option>)}</select></label><Input name="title" maxLength={120} placeholder="Judul ulasan" /><Textarea name="body" rows={3} maxLength={3000} placeholder="Ceritakan pengalamanmu" /><Button type="submit" size="sm" disabled={pending}>Kirim ulasan</Button></form> : null}
    </div>
  );
}
