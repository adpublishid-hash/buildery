"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateStorefrontPageContentAction } from "@/lib/actions/storefront-content";
import {
  STOREFRONT_PAGES,
  type StorefrontField,
  type StorefrontPageKey,
} from "@/lib/storefront-content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function StorefrontContentForm({
  pageKey,
  initial,
  canEdit,
}: {
  pageKey: StorefrontPageKey;
  initial: Record<string, string>;
  canEdit: boolean;
}) {
  const fields = STOREFRONT_PAGES[pageKey].fields as StorefrontField[];
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of fields) v[f.key] = initial[f.key] ?? "";
    return v;
  });

  const set = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          const res = await updateStorefrontPageContentAction(pageKey, formData);
          if (res.ok) {
            toast.success("Tersimpan.");
            router.refresh();
          } else {
            toast.error(res.error);
          }
        });
      }}
      className="space-y-4"
    >
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Kosongkan field untuk memakai teks default.
      </p>
      {fields.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <Label htmlFor={`${pageKey}-${f.key}`}>{f.label}</Label>
          {f.multiline ? (
            <Textarea
              id={`${pageKey}-${f.key}`}
              name={f.key}
              value={values[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={f.placeholder}
              disabled={!canEdit || pending}
              rows={2}
              maxLength={500}
            />
          ) : (
            <Input
              id={`${pageKey}-${f.key}`}
              name={f.key}
              value={values[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={f.placeholder}
              disabled={!canEdit || pending}
              maxLength={500}
            />
          )}
        </div>
      ))}
      {canEdit ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          Kamu tidak punya izin untuk mengubah halaman ini.
        </p>
      )}
    </form>
  );
}
