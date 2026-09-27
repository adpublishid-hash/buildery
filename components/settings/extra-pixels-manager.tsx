"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Globe2, Loader2, Pencil, Plus, Server, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteAdPixelAction, saveAdPixelAction, sendAdPixelTestAction } from "@/lib/actions/ad-pixels";
import { AD_PIXEL_LIMIT, CLEAR_AD_PIXEL_TOKEN } from "@/lib/ad-pixel-constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/** What the browser may know about an extra pixel: never its token. */
export type ExtraPixelView = {
  id: string;
  pixelId: string;
  label: string | null;
  serverEnabled: boolean;
  hasToken: boolean;
  testEventCode: string | null;
  isActive: boolean;
};

type Provider = "META" | "TIKTOK";

const COPY: Record<Provider, { name: string; server: string; idHint: string; idPlaceholder: string; tokenPlaceholder: string }> = {
  META: {
    name: "Meta Pixel",
    server: "Conversions API",
    idHint: "6–30 digit angka dari Events Manager.",
    idPlaceholder: "123456789012345",
    tokenPlaceholder: "EAAB…",
  },
  TIKTOK: {
    name: "TikTok Pixel",
    server: "Events API",
    idHint: "Kode pixel 10–40 huruf/angka.",
    idPlaceholder: "C4ABCDEFGH1234567890",
    tokenPlaceholder: "Access token dari Events Manager",
  },
};

type Draft = {
  id?: string;
  pixelId: string;
  label: string;
  isActive: boolean;
  serverEnabled: boolean;
  accessToken: string;
  clearToken: boolean;
  testEventCode: string;
  hasToken: boolean;
};

const EMPTY: Draft = {
  pixelId: "",
  label: "",
  isActive: true,
  serverEnabled: false,
  accessToken: "",
  clearToken: false,
  testEventCode: "",
  hasToken: false,
};

/**
 * Extra pixels for one platform. Each gets every event the primary pixel
 * gets: in the browser always, and from the server when it has a token.
 */
export function ExtraPixelsManager({
  provider,
  pixels,
  canEdit,
}: {
  provider: Provider;
  pixels: ExtraPixelView[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const copy = COPY[provider];
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const atLimit = pixels.length >= AD_PIXEL_LIMIT;

  function edit(pixel?: ExtraPixelView) {
    setErrors({});
    setDraft(
      pixel
        ? {
            id: pixel.id,
            pixelId: pixel.pixelId,
            label: pixel.label ?? "",
            isActive: pixel.isActive,
            serverEnabled: pixel.serverEnabled,
            accessToken: "",
            clearToken: false,
            testEventCode: pixel.testEventCode ?? "",
            hasToken: pixel.hasToken,
          }
        : { ...EMPTY }
    );
  }

  function save() {
    if (!draft) return;
    startTransition(async () => {
      const res = await saveAdPixelAction({
        id: draft.id,
        provider,
        pixelId: draft.pixelId,
        label: draft.label,
        isActive: draft.isActive,
        serverEnabled: draft.serverEnabled,
        accessToken: draft.clearToken ? CLEAR_AD_PIXEL_TOKEN : draft.accessToken,
        testEventCode: draft.testEventCode,
      });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      toast.success(draft.id ? "Pixel diperbarui" : "Pixel ditambahkan");
      setDraft(null);
      router.refresh();
    });
  }

  function remove(pixel: ExtraPixelView) {
    if (!window.confirm(`Hapus ${copy.name} ${pixel.pixelId}? Event yang masih antre untuk pixel ini ikut dibuang.`)) return;
    setBusy(pixel.id);
    startTransition(async () => {
      const res = await deleteAdPixelAction(pixel.id);
      setBusy(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Pixel dihapus");
      router.refresh();
    });
  }

  function test(pixel: ExtraPixelView) {
    setBusy(`test:${pixel.id}`);
    startTransition(async () => {
      const res = await sendAdPixelTestAction(pixel.id);
      setBusy(null);
      if (res.ok) toast.success(res.message ?? "Event uji terkirim");
      else toast.error(res.error);
    });
  }

  return (
    <section className="mt-[12px] rounded-[12px] border-[0.8px] border-kv-border p-[14px]">
      <div className="flex flex-wrap items-start justify-between gap-[10px]">
        <div className="min-w-0">
          <h4 className="text-[13px] font-semibold text-kv-fg">
            {copy.name} tambahan{" "}
            <span className="kv-tabular font-normal text-kv-muted-fg">
              · {pixels.length}/{AD_PIXEL_LIMIT}
            </span>
          </h4>
          <p className="mt-[2px] max-w-[640px] text-[12px] leading-[1.5] text-kv-muted-fg">
            Setiap event yang diterima pixel utama juga dikirim ke pixel di sini — dari browser, dan dari server lewat{" "}
            {copy.server} bila token diisi. Cocok untuk beberapa akun iklan atau pixel cadangan.
          </p>
        </div>
        {canEdit && !draft ? (
          <Button type="button" size="sm" variant="outline" onClick={() => edit()} disabled={atLimit} title={atLimit ? `Maksimal ${AD_PIXEL_LIMIT} pixel tambahan` : undefined}>
            <Plus /> Tambah pixel
          </Button>
        ) : null}
      </div>

      {pixels.length > 0 ? (
        <ul className="mt-[12px] overflow-hidden rounded-[10px] border-[0.8px] border-kv-border">
          {pixels.map((pixel) => (
            <li key={pixel.id} className="flex flex-wrap items-center gap-[10px] border-b border-black/[0.06] px-[12px] py-[10px] last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-kv-fg">{pixel.label || copy.name}</p>
                <p className="truncate font-mono text-[12px] text-kv-muted-fg">{pixel.pixelId}</p>
              </div>
              <div className="flex flex-wrap items-center gap-[4px]">
                <Chip on={pixel.isActive} icon={Globe2}>{pixel.isActive ? "Browser" : "Nonaktif"}</Chip>
                <Chip on={pixel.isActive && pixel.serverEnabled && pixel.hasToken} icon={Server}>
                  {copy.server}
                </Chip>
              </div>
              {canEdit ? (
                <div className="flex items-center gap-[2px]">
                  <IconButton
                    label="Kirim event uji"
                    onClick={() => test(pixel)}
                    disabled={pending || !pixel.hasToken}
                    busy={busy === `test:${pixel.id}`}
                  >
                    <FlaskConical />
                  </IconButton>
                  <IconButton label="Edit" onClick={() => edit(pixel)} disabled={pending}>
                    <Pencil />
                  </IconButton>
                  <IconButton label="Hapus" onClick={() => remove(pixel)} disabled={pending} busy={busy === pixel.id} danger>
                    <Trash2 />
                  </IconButton>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : !draft ? (
        <p className="mt-[12px] rounded-[10px] border-[0.8px] border-dashed border-kv-border px-[12px] py-[14px] text-center text-[12px] text-kv-muted-fg">
          Belum ada pixel tambahan. Pixel utama di atas tetap bekerja seperti biasa.
        </p>
      ) : null}

      {draft ? (
        <div className="mt-[12px] animate-kv-fade rounded-[10px] border-[0.8px] border-kv-fg p-[14px]">
          <p className="mb-[12px] text-[13px] font-medium text-kv-fg">{draft.id ? "Edit pixel" : `Tambah ${copy.name}`}</p>
          <div className="grid gap-[12px] md:grid-cols-2">
            <Field label="Pixel ID" error={errors.pixelId?.[0]} hint={copy.idHint}>
              <Input
                value={draft.pixelId}
                placeholder={copy.idPlaceholder}
                onChange={(e) => setDraft({ ...draft, pixelId: e.target.value.trim() })}
                className="font-mono"
              />
            </Field>
            <Field label="Nama (opsional)" error={errors.label?.[0]} hint="Mis. nama akun iklan atau klien.">
              <Input value={draft.label} maxLength={60} placeholder="Akun iklan B" onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            </Field>
          </div>

          <div className="mt-[12px] space-y-[10px] rounded-[8px] bg-kv-secondary p-[12px]">
            <Toggle
              label="Aktif"
              hint="Pixel nonaktif tidak dimuat dan tidak menerima event."
              checked={draft.isActive}
              onChange={(isActive) => setDraft({ ...draft, isActive })}
            />
            <Toggle
              label={`Kirim juga dari server (${copy.server})`}
              hint="Event tetap tercatat walau browser memblokir pixel. Butuh access token."
              checked={draft.serverEnabled}
              onChange={(serverEnabled) => setDraft({ ...draft, serverEnabled })}
            />
          </div>

          {draft.serverEnabled ? (
            <div className="mt-[12px] grid gap-[12px] md:grid-cols-2">
              <Field
                label="Access token"
                error={errors.accessToken?.[0]}
                hint={
                  draft.hasToken && !draft.clearToken ? (
                    <>
                      Token tersimpan. Kosongkan untuk tetap memakainya.{" "}
                      <button type="button" className="font-medium text-kv-fg underline underline-offset-2" onClick={() => setDraft({ ...draft, clearToken: true, accessToken: "" })}>
                        Hapus token
                      </button>
                    </>
                  ) : draft.clearToken ? (
                    "Token akan dihapus saat disimpan."
                  ) : (
                    "Disimpan di server, tidak pernah dikirim ke browser."
                  )
                }
              >
                <Input
                  type="password"
                  autoComplete="off"
                  value={draft.accessToken}
                  placeholder={draft.hasToken && !draft.clearToken ? "•••••••• (tersimpan)" : copy.tokenPlaceholder}
                  onChange={(e) => setDraft({ ...draft, accessToken: e.target.value, clearToken: false })}
                />
              </Field>
              <Field label="Test event code (opsional)" error={errors.testEventCode?.[0]} hint="Isi saat menguji, kosongkan untuk produksi.">
                <Input value={draft.testEventCode} placeholder="TEST12345" onChange={(e) => setDraft({ ...draft, testEventCode: e.target.value })} />
              </Field>
            </div>
          ) : null}

          <div className="mt-[14px] flex justify-end gap-[6px]">
            <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={pending}>
              Batal
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={pending || !draft.pixelId}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {draft.id ? "Simpan pixel" : "Tambah pixel"}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Chip({ on, icon: Icon, children }: { on: boolean; icon: typeof Globe2; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-[20px] items-center gap-[4px] rounded-[6px] border-[0.8px] px-[6px] text-[11px] font-medium",
        on ? "border-kv-border bg-kv-card text-kv-secondary-fg" : "border-dashed border-kv-border text-kv-subtle"
      )}
    >
      <Icon className={cn("h-[11px] w-[11px]", on ? "text-kv-success" : "")} />
      {children}
    </span>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  busy,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-[28px] w-[28px] items-center justify-center rounded-[7px] text-kv-muted-fg transition-colors hover:bg-kv-hover disabled:opacity-40 [&_svg]:h-[14px] [&_svg]:w-[14px]",
        danger ? "hover:text-kv-destructive" : "hover:text-kv-fg"
      )}
    >
      {busy ? <Loader2 className="animate-spin" /> : children}
    </button>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-[6px]">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-[12px] text-kv-destructive">{error}</p> : hint ? <p className="text-[11px] leading-[1.45] text-kv-muted-fg">{hint}</p> : null}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-[12px]">
      <span>
        <span className="block text-[13px] font-medium text-kv-fg">{label}</span>
        <span className="block text-[12px] text-kv-muted-fg">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
