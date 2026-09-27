"use client";

import { useMemo, useState, useTransition } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateSalesNotificationAction } from "@/lib/actions/storefront-settings";
import { DEFAULT_SALES_NOTIFICATION_TEXT } from "@/lib/sales-notification-shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  enabled: boolean;
  text: string | null;
  canEdit: boolean;
};

const EXAMPLE = {
  name: "Wahib R.",
  action: "membeli",
  item: "Paket Premium",
  type: "Produk",
  time: "baru saja",
};

export function SalesNotificationForm({ enabled, text, canEdit }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [template, setTemplate] = useState(
    text || DEFAULT_SALES_NOTIFICATION_TEXT
  );

  const preview = useMemo(() => renderPreview(template), [template]);

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          const res = await updateSalesNotificationAction(formData);
          if (res.ok) {
            toast.success("Sales notification tersimpan.");
            router.refresh();
          } else {
            toast.error(res.error);
          }
        });
      }}
      className="space-y-4"
    >
      <input
        type="hidden"
        name="salesNotificationEnabled"
        value={isEnabled ? "true" : "false"}
      />
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-200 dark:ring-zinc-800">
            <BellRing className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              Aktifkan sales notification
            </p>
            <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              Tampilkan pop-up kecil dari pembelian produk, enrollment kursus,
              dan membership aktif terbaru di halaman publik.
            </p>
          </div>
        </div>
        <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-zinc-300"
            checked={isEnabled}
            onChange={(event) => setIsEnabled(event.target.checked)}
            disabled={!canEdit || pending}
          />
          {isEnabled ? "Aktif" : "Nonaktif"}
        </label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="salesNotificationText">Custom text</Label>
        <Textarea
          id="salesNotificationText"
          name="salesNotificationText"
          rows={3}
          value={template}
          onChange={(event) => setTemplate(event.target.value)}
          disabled={!canEdit || pending}
          maxLength={220}
          placeholder={DEFAULT_SALES_NOTIFICATION_TEXT}
        />
        <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          Placeholder: {"{name}"}, {"{action}"}, {"{item}"}, {"{type}"},{" "}
          {"{time}"}. Kosongkan untuk memakai teks default.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-xs font-medium uppercase text-zinc-400">Preview</p>
        <p className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {preview}
        </p>
      </div>

      {canEdit ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {pending ? "Menyimpan..." : "Simpan sales notification"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          Kamu tidak punya izin untuk mengubah sales notification.
        </p>
      )}
    </form>
  );
}

function renderPreview(template: string) {
  const source = template.trim() || DEFAULT_SALES_NOTIFICATION_TEXT;
  return source.replace(
    /\{(name|action|item|type|time)\}/g,
    (_, key: string) => EXAMPLE[key as keyof typeof EXAMPLE] ?? ""
  );
}
