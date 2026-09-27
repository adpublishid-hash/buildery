"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { generatePageSectionsAction } from "@/lib/actions/ai";
import type { BlockInput } from "@/lib/blocks/schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type AiGeneratePayload = {
  blocks: BlockInput[];
  mode: "append" | "replace";
};

/** Concrete starting points beat a blank textarea for a feature like this. */
const EXAMPLES = [
  "Landing page kursus baking online untuk pemula, 6 section, ada harga dan FAQ",
  "Halaman jasa desain interior rumah minimalis di Bandung, fokus konsultasi gratis",
  "Landing page produk skincare lokal, soroti bahan alami dan testimoni pembeli",
];

export function AiGenerateDialog({
  hasBlocks,
  onGenerate,
}: {
  hasBlocks: boolean;
  onGenerate: (payload: AiGeneratePayload) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [mode, setMode] = useState<AiGeneratePayload["mode"]>("append");
  const [pending, startTransition] = useTransition();

  function handleGenerate() {
    const trimmed = brief.trim();
    if (trimmed.length < 8) {
      toast.error("Tulis dulu halaman seperti apa yang kamu mau.");
      return;
    }

    startTransition(async () => {
      const result = await generatePageSectionsAction(trimmed);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const applied = onGenerate({
        blocks: result.blocks,
        mode: hasBlocks ? mode : "replace",
      });
      if (!applied) return;

      setOpen(false);
      setBrief("");
      toast.success(
        `${result.blocks.length} section dibuat. Semuanya block biasa — edit sesukamu.`
      );
      if (result.skipped > 0) {
        toast.info(`${result.skipped} section dilewati karena tidak dikenali.`);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-request would strand the generation the operator paid for.
        if (pending) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Buat dengan AI">
          <Sparkles />
          <span className="hidden xl:inline">Buat dengan AI</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-4 w-4 text-zinc-500" />
            Buat halaman dengan AI
          </DialogTitle>
          <DialogDescription>
            Ceritakan halaman yang kamu butuhkan. Claude menyusun struktur
            section dan menulis copy-nya — hasilnya jadi block biasa yang bisa
            kamu edit, bukan kode yang terkunci.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ai-brief">Deskripsi halaman</Label>
            <Textarea
              id="ai-brief"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              disabled={pending}
              rows={5}
              maxLength={1200}
              placeholder="Contoh: landing page kursus baking online untuk pemula, 6 section, ada harga dan FAQ"
            />
            <p className="text-xs text-zinc-500">
              Semakin spesifik (produk, target pembeli, penawaran), semakin
              relevan hasilnya. {brief.trim().length}/1200
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Contoh brief
            </p>
            <div className="flex flex-col gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  disabled={pending}
                  onClick={() => setBrief(example)}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-left text-xs text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          {hasBlocks ? (
            <div className="space-y-2">
              <Label>Halaman ini sudah ada isinya</Label>
              <div className="flex gap-2">
                {(
                  [
                    { id: "append", label: "Tambahkan di bawah" },
                    { id: "replace", label: "Ganti semua" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    disabled={pending}
                    onClick={() => setMode(option.id)}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-sm transition disabled:opacity-60",
                      mode === option.id
                        ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                        : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Batal
          </Button>
          <Button onClick={handleGenerate} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles />}
            {pending ? "Menyusun halaman..." : "Buat section"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
