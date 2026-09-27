"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { updateStorefrontNavAction } from "@/lib/actions/storefront-settings";
import {
  DEFAULT_STORE_NAV,
  isSafeNavHref,
  type StoreNavLink,
} from "@/lib/storefront-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Initial = {
  navBlogLabel: string;
  navCoursesLabel: string;
  navProductsLabel: string;
  navMembershipsLabel: string;
  navCartLabel: string;
  navAccountLabel: string;
  navLoginLabel: string;
};

const MAX_LINKS = 8;

const FIELDS: Array<{
  name: keyof Initial;
  label: string;
  fallback: string;
}> = [
  { name: "navBlogLabel", label: "Blog", fallback: DEFAULT_STORE_NAV.blog },
  { name: "navCoursesLabel", label: "Kursus", fallback: DEFAULT_STORE_NAV.courses },
  { name: "navProductsLabel", label: "Produk", fallback: DEFAULT_STORE_NAV.products },
  { name: "navMembershipsLabel", label: "Membership", fallback: DEFAULT_STORE_NAV.memberships },
  { name: "navCartLabel", label: "Keranjang", fallback: DEFAULT_STORE_NAV.cart },
  { name: "navAccountLabel", label: "Akun", fallback: DEFAULT_STORE_NAV.account },
  { name: "navLoginLabel", label: "Login", fallback: DEFAULT_STORE_NAV.login },
];

export function StorefrontHeaderForm({
  initial,
  initialLinks,
  canEdit,
}: {
  initial: Initial;
  initialLinks: StoreNavLink[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Initial>(initial);
  const [links, setLinks] = useState<StoreNavLink[]>(initialLinks);

  const set = (name: keyof Initial, value: string) =>
    setValues((prev) => ({ ...prev, [name]: value }));

  const setLink = (i: number, patch: Partial<StoreNavLink>) =>
    setLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLink = () =>
    setLinks((prev) =>
      prev.length >= MAX_LINKS ? prev : [...prev, { label: "", href: "" }]
    );
  const removeLink = (i: number) =>
    setLinks((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          const res = await updateStorefrontNavAction(formData);
          if (res.ok) {
            toast.success("Menu header tersimpan.");
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
        name="navCustomLinks"
        value={JSON.stringify(
          links
            .map((l) => ({ label: l.label.trim(), href: l.href.trim() }))
            .filter((l) => l.label && l.href)
        )}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <div key={field.name} className="space-y-1.5">
            <Label htmlFor={field.name}>{field.label}</Label>
            <Input
              id={field.name}
              name={field.name}
              value={values[field.name]}
              onChange={(e) => set(field.name, e.target.value)}
              placeholder={field.fallback}
              disabled={!canEdit || pending}
              maxLength={40}
            />
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-xl border border-kv-border p-3 dark:border-zinc-800">
        <div>
          <p className="text-sm font-medium text-kv-fg dark:text-zinc-50">
            Link kustom
          </p>
          <p className="text-xs text-kv-muted-fg dark:text-zinc-400">
            Tambah menu sendiri (mis. &quot;Tentang&quot;, &quot;Kontak&quot;,
            WhatsApp). URL boleh penuh (https://…), path situs (/about), atau
            anchor (#kontak). Maks {MAX_LINKS} link.
          </p>
        </div>

        {links.length === 0 ? (
          <p className="text-xs text-kv-subtle">Belum ada link kustom.</p>
        ) : (
          <div className="space-y-2">
            {links.map((link, i) => {
              const badHref = link.href.trim() !== "" && !isSafeNavHref(link.href);
              return (
                <div key={i} className="flex items-start gap-2">
                  <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                    <Input
                      aria-label={`Label link ${i + 1}`}
                      placeholder="Label (mis. Tentang)"
                      value={link.label}
                      onChange={(e) => setLink(i, { label: e.target.value })}
                      disabled={!canEdit || pending}
                      maxLength={40}
                    />
                    <div className="space-y-1">
                      <Input
                        aria-label={`URL link ${i + 1}`}
                        placeholder="https://… atau /about atau #kontak"
                        value={link.href}
                        onChange={(e) => setLink(i, { href: e.target.value })}
                        disabled={!canEdit || pending}
                        maxLength={300}
                        className={badHref ? "border-red-400" : undefined}
                      />
                      {badHref ? (
                        <p className="text-[11px] text-kv-destructive">
                          URL harus diawali http(s)://, / , atau #
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {canEdit ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLink(i)}
                      disabled={pending}
                      aria-label="Hapus link"
                      className="mt-0.5 text-kv-subtle hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {canEdit && links.length < MAX_LINKS ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addLink}
            disabled={pending}
          >
            <Plus className="h-3.5 w-3.5" /> Tambah link
          </Button>
        ) : null}
      </div>

      {canEdit ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan menu"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-kv-muted-fg">
          Kamu tidak punya izin untuk mengubah menu header.
        </p>
      )}
    </form>
  );
}
