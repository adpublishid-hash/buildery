"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createTemplateFromPageAction } from "@/lib/actions/admin";

export type TemplateSourcePage = {
  id: string;
  label: string;
  blockCount: number;
};

/**
 * Membuat template platform dengan menyalin blok satu halaman yang sudah jadi.
 *
 * Jauh lebih berguna daripada menyusun ulang block dari nol — dan sampai
 * sekarang tidak ada cara apa pun untuk mengisi konten sebuah template.
 */
export function TemplateFromPageDialog({
  pages,
}: {
  pages: TemplateSourcePage[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function onSubmit(formData: FormData) {
    setFieldErrors({});
    startTransition(async () => {
      const res = await createTemplateFromPageAction(formData);
      if (!res.ok) {
        setFieldErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      toast.success("Template dibuat dari halaman.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={pages.length === 0}>
          <Copy className="h-4 w-4" />
          Dari halaman
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Buat template dari halaman</DialogTitle>
          <DialogDescription>
            Block halaman disalin apa adanya, beserta tema situsnya.
          </DialogDescription>
        </DialogHeader>

        <form action={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="pageId">Halaman sumber</Label>
            <select
              id="pageId"
              name="pageId"
              required
              className="mt-1 h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
            >
              {pages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.label} ({page.blockCount} block)
                </option>
              ))}
            </select>
            <FieldError errors={fieldErrors.pageId} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="tfp-name">Nama template</Label>
              <Input id="tfp-name" name="name" required maxLength={80} />
              <FieldError errors={fieldErrors.name} />
            </div>
            <div>
              <Label htmlFor="tfp-slug">Slug</Label>
              <Input id="tfp-slug" name="slug" required maxLength={80} />
              <FieldError errors={fieldErrors.slug} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="tfp-category">Kategori</Label>
              <Input
                id="tfp-category"
                name="category"
                maxLength={40}
                placeholder="Landing, Toko, Profil…"
              />
            </div>
            <div>
              <Label htmlFor="tfp-thumbnail">Thumbnail (URL)</Label>
              <Input id="tfp-thumbnail" name="thumbnail" type="url" />
              <FieldError errors={fieldErrors.thumbnail} />
            </div>
          </div>

          <div>
            <Label htmlFor="tfp-description">Deskripsi</Label>
            <Textarea
              id="tfp-description"
              name="description"
              rows={2}
              maxLength={500}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isPublished" value="true" />
            Terbitkan langsung ke builder
          </label>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Buat template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="mt-1 text-xs text-red-600">{errors[0]}</p>;
}
