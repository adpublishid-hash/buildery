"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateStorefrontFooterAction } from "@/lib/actions/storefront-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Initial = {
  footerEnabled: boolean;
  footerText: string;
  footerCopyright: string;
};

export function StorefrontFooterForm({
  initial,
  canEdit,
  workspaceName,
}: {
  initial: Initial;
  canEdit: boolean;
  workspaceName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initial.footerEnabled);
  const [text, setText] = useState(initial.footerText);
  const [copyright, setCopyright] = useState(initial.footerCopyright);

  const previewCopyright =
    copyright.trim() || `© ${new Date().getFullYear()} ${workspaceName}`;

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          const res = await updateStorefrontFooterAction(formData);
          if (res.ok) {
            toast.success("Footer tersimpan.");
            router.refresh();
          } else {
            toast.error(res.error);
          }
        });
      }}
      className="space-y-4"
    >
      <input type="hidden" name="footerEnabled" value={enabled ? "true" : "false"} />

      <div className="flex items-center justify-between rounded-lg border border-kv-border p-3 dark:border-zinc-800">
        <div>
          <p className="text-sm font-medium text-kv-fg dark:text-zinc-50">
            Tampilkan footer
          </p>
          <p className="text-xs text-kv-muted-fg">
            Footer tampil di bawah semua halaman publik.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          disabled={!canEdit || pending}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="footerText">Teks footer</Label>
        <Textarea
          id="footerText"
          name="footerText"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Mis. deskripsi singkat brand, alamat, atau tagline."
          disabled={!canEdit || pending}
          rows={2}
          maxLength={300}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="footerCopyright">Copyright</Label>
        <Input
          id="footerCopyright"
          name="footerCopyright"
          value={copyright}
          onChange={(e) => setCopyright(e.target.value)}
          placeholder={`© ${new Date().getFullYear()} ${workspaceName}`}
          disabled={!canEdit || pending}
          maxLength={120}
        />
      </div>

      <div className="rounded-xl border border-kv-border bg-kv-secondary p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-kv-subtle">
          Preview
        </p>
        {enabled ? (
          <div className="space-y-1 text-center">
            {text.trim() ? (
              <p className="text-sm text-kv-secondary-fg dark:text-zinc-300">{text}</p>
            ) : null}
            <p className="text-xs text-kv-muted-fg">{previewCopyright}</p>
          </div>
        ) : (
          <p className="text-xs text-kv-subtle">Footer dimatikan.</p>
        )}
      </div>

      {canEdit ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan footer"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-kv-muted-fg">
          Kamu tidak punya izin untuk mengubah footer.
        </p>
      )}
    </form>
  );
}
