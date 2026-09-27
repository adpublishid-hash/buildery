"use client";

import { useTransition } from "react";
import type { ProductType } from "@prisma/client";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  generateProductCopyAction,
  type GenerateProductCopyActionResult,
} from "@/lib/actions/ai";
import { Button } from "@/components/ui/button";

type Copy = Extract<GenerateProductCopyActionResult, { ok: true }>["copy"];

/**
 * Drafts product copy from whatever the seller has already typed. Deliberately
 * a small button rather than a dialog: the form itself is the preview, and the
 * seller edits in place.
 */
export function AiCopyButton({
  getContext,
  onCopy,
}: {
  getContext: () => {
    name: string;
    hint: string;
    type: ProductType;
    price: string;
  };
  onCopy: (copy: Copy) => void;
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    const context = getContext();
    if (context.name.trim().length < 2) {
      toast.error("Isi dulu nama produknya.");
      return;
    }

    startTransition(async () => {
      const result = await generateProductCopyAction(context);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onCopy(result.copy);
      toast.success("Draft copy terisi. Periksa dan sesuaikan sebelum simpan.");
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={handleClick}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Sparkles className="h-3.5 w-3.5" />
      )}
      {pending ? "Menulis..." : "Tulis dengan AI"}
    </Button>
  );
}
