"use client";

import { useState, useTransition } from "react";
import { Truck } from "lucide-react";
import { toast } from "sonner";

import {
  importOrderTrackingAction,
  type TrackingImportSummary,
} from "@/lib/actions/order";
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

/**
 * Pasting a courier's export instead of opening fifty orders one at a time.
 *
 * The result deliberately lists what could not be applied: a parcel whose resi
 * never landed turns into a support ticket a week later.
 */
export function TrackingImportDialog() {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<TrackingImportSummary | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSummary(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Truck className="h-4 w-4" />
          Impor resi
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Impor nomor resi</DialogTitle>
          <DialogDescription>
            Tempel dari spreadsheet kurir. Satu baris per pesanan: nomor order,
            nomor resi, lalu kurir (opsional). Baris header ikut terbaca.
          </DialogDescription>
        </DialogHeader>

        <form
          action={(formData) =>
            startTransition(async () => {
              const result = await importOrderTrackingAction(formData);
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              setSummary(result.data ?? null);
              if (result.data?.updated) {
                toast.success(`${result.data.updated} pesanan diperbarui`);
              }
            })
          }
          className="space-y-3"
        >
          <div className="space-y-2">
            <Label htmlFor="tracking-rows">Data resi</Label>
            <Textarea
              id="tracking-rows"
              name="rows"
              rows={8}
              required
              spellCheck={false}
              placeholder={"ORD-A1B2C3,JX1234567890,JNE\nORD-D4E5F6,JP0987654321,J&T"}
              className="font-mono text-xs"
            />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Memproses..." : "Terapkan"}
          </Button>
        </form>

        {summary ? (
          <div className="space-y-2 border-t border-zinc-200 pt-3 text-sm dark:border-zinc-800">
            <p className="font-medium">
              {summary.updated} pesanan ditandai dikirim.
            </p>
            {summary.problems.length > 0 ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-900/60 dark:bg-amber-950/30">
                <p className="font-semibold text-amber-900 dark:text-amber-200">
                  {summary.problems.length} baris tidak bisa diterapkan:
                </p>
                <ul className="mt-1 space-y-0.5 text-amber-900 dark:text-amber-200">
                  {summary.problems.slice(0, 12).map((problem, index) => (
                    <li key={index}>
                      <span className="font-mono">{problem.reference}</span> —{" "}
                      {problem.reason}
                    </li>
                  ))}
                </ul>
                {summary.problems.length > 12 ? (
                  <p className="mt-1 text-amber-800 dark:text-amber-300">
                    …dan {summary.problems.length - 12} lagi.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
