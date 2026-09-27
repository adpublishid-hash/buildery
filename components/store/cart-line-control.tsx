"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  removeCartItemAction,
  updateCartItemAction,
} from "@/lib/actions/cart";

type Props = {
  productId: string;
  variantId?: string | null;
  quantity: number;
  max: number;
};

export function CartLineControl({ productId, variantId = null, quantity, max }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setQuantity(next: number) {
    startTransition(async () => {
      const res = await updateCartItemAction(productId, next, variantId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await removeCartItemAction(productId, variantId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Removed from cart");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 items-center rounded-lg border border-zinc-200">
        <button
          type="button"
          disabled={pending || quantity <= 1}
          onClick={() => setQuantity(quantity - 1)}
          className="flex h-full w-8 items-center justify-center text-zinc-500 hover:text-zinc-900 disabled:opacity-30"
          aria-label="Decrease quantity"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-7 text-center text-sm font-medium text-zinc-900">
          {pending ? (
            <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" />
          ) : (
            quantity
          )}
        </span>
        <button
          type="button"
          disabled={pending || quantity >= max}
          onClick={() => setQuantity(quantity + 1)}
          className="flex h-full w-8 items-center justify-center text-zinc-500 hover:text-zinc-900 disabled:opacity-30"
          aria-label="Increase quantity"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={remove}
        className="text-zinc-400 transition-colors hover:text-red-600"
        aria-label="Remove item"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
