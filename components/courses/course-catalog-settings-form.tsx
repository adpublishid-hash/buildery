"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { updateLmsCatalogSettingsAction } from "@/lib/actions/lms-settings";
import { DEFAULT_LMS_CATALOG } from "@/lib/lms-catalog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  workspaceName: string;
  canEdit: boolean;
  initial: {
    catalogEyebrow: string;
    catalogHeading: string;
    catalogSubheading: string;
  };
};

export function CourseCatalogSettingsForm({
  workspaceName,
  canEdit,
  initial,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [eyebrow, setEyebrow] = useState(initial.catalogEyebrow);
  const [heading, setHeading] = useState(initial.catalogHeading);
  const [subheading, setSubheading] = useState(initial.catalogSubheading);

  const previewEyebrow = eyebrow.trim() || DEFAULT_LMS_CATALOG.eyebrow;
  const previewHeading = heading.trim() || DEFAULT_LMS_CATALOG.heading;
  const previewSubheading = subheading.trim() || DEFAULT_LMS_CATALOG.subheading;

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          const res = await updateLmsCatalogSettingsAction(formData);
          if (res.ok) {
            toast.success("Halaman katalog tersimpan.");
            router.refresh();
          } else {
            toast.error(res.error);
          }
        });
      }}
      className="space-y-4"
    >
      <Card>
        <CardHeader>
          <CardTitle>Teks hero</CardTitle>
          <CardDescription>
            Teks ini tampil di bagian atas halaman katalog kursus publik.
            Kosongkan sebuah field untuk memakai teks default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="catalogEyebrow">Label badge</Label>
            <Input
              id="catalogEyebrow"
              name="catalogEyebrow"
              value={eyebrow}
              onChange={(e) => setEyebrow(e.target.value)}
              placeholder={DEFAULT_LMS_CATALOG.eyebrow}
              disabled={!canEdit || pending}
              maxLength={80}
            />
            <p className="text-xs text-zinc-500">
              Ditampilkan sebagai{" "}
              <span className="font-medium text-zinc-700">
                {workspaceName} {previewEyebrow}
              </span>
              .
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="catalogHeading">Judul</Label>
            <Input
              id="catalogHeading"
              name="catalogHeading"
              value={heading}
              onChange={(e) => setHeading(e.target.value)}
              placeholder={DEFAULT_LMS_CATALOG.heading}
              disabled={!canEdit || pending}
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="catalogSubheading">Deskripsi</Label>
            <Textarea
              id="catalogSubheading"
              name="catalogSubheading"
              value={subheading}
              onChange={(e) => setSubheading(e.target.value)}
              placeholder={DEFAULT_LMS_CATALOG.subheading}
              disabled={!canEdit || pending}
              rows={3}
              maxLength={500}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>Perkiraan tampilan di halaman publik.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              {workspaceName} {previewEyebrow}
            </div>
            <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-zinc-950">
              {previewHeading}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-600">
              {previewSubheading}
            </p>
          </div>
        </CardContent>
      </Card>

      {canEdit ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          Kamu tidak punya izin untuk mengubah halaman katalog.
        </p>
      )}
    </form>
  );
}
