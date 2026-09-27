"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveBillingSettingsAction } from "@/lib/actions/admin";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/lib/upload-constants";

type Props = {
  settings: {
    qrisImageUrl: string | null;
    qrisMerchantName: string | null;
    whatsappNumber: string | null;
    paymentInstruction: string | null;
    invoiceWindowHours: number;
    graceDays: number;
  };
};

/**
 * QR dan nomor konfirmasi dulunya di-hardcode di komponen pricing, jadi
 * menggantinya butuh deploy — dan kalau file QR-nya hilang, checkout berhenti
 * total. Sekarang keduanya bisa dirotasi dari sini.
 */
export function BillingSettingsForm({ settings }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [qrisUrl, setQrisUrl] = useState(settings.qrisImageUrl ?? "");

  // QR yang menumpang domain lain ikut mati saat domain itu berubah, dan
  // pembayaran berhenti tanpa peringatan. Tandai selama masih begitu.
  const isExternal = /^https?:\/\//.test(qrisUrl);

  async function uploadQris(file: File) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Hanya PNG, JPG, WEBP, atau GIF.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("Ukuran maksimal 5 MB.");
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/qris", { method: "POST", body });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        toast.error(json.error ?? "Gagal mengunggah QRIS.");
        return;
      }
      setQrisUrl(json.url);
      toast.success("QRIS terunggah. Simpan untuk menerapkannya.");
    } catch {
      toast.error("Gagal mengunggah QRIS.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await saveBillingSettingsAction(formData);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Pengaturan pembayaran tersimpan.");
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="qrisImageUrl">URL gambar QRIS</Label>
          <Input
            id="qrisImageUrl"
            name="qrisImageUrl"
            value={qrisUrl}
            onChange={(event) => setQrisUrl(event.target.value)}
            placeholder="https://… atau /uploads/…"
          />

          <input
            ref={fileRef}
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(",")}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadQris(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? "Mengunggah…" : "Unggah QRIS ke server sendiri"}
          </Button>

          {isExternal ? (
            <p className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              QRIS ini di-host di domain lain. Kalau file itu dipindah atau
              domainnya mati, halaman pembayaran menampilkan QR rusak dan
              transaksi berhenti. Unggah salinannya ke server sendiri.
            </p>
          ) : null}

          {qrisUrl ? (
            <div className="mt-3 w-40 rounded-lg border border-zinc-200 bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrisUrl} alt="Pratinjau QRIS" className="w-full" />
            </div>
          ) : null}
        </div>

        <div>
          <Label htmlFor="qrisMerchantName">Nama merchant</Label>
          <Input
            id="qrisMerchantName"
            name="qrisMerchantName"
            defaultValue={settings.qrisMerchantName ?? ""}
            placeholder="My Landing"
          />
        </div>

        <div>
          <Label htmlFor="whatsappNumber">Nomor WhatsApp konfirmasi</Label>
          <Input
            id="whatsappNumber"
            name="whatsappNumber"
            defaultValue={settings.whatsappNumber ?? ""}
            placeholder="08xx atau 62xx"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Disimpan dalam format wa.me otomatis.
          </p>
        </div>

        <div>
          <Label htmlFor="invoiceWindowHours">Masa berlaku tagihan (jam)</Label>
          <Input
            id="invoiceWindowHours"
            name="invoiceWindowHours"
            type="number"
            min={1}
            max={336}
            defaultValue={settings.invoiceWindowHours}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Setelah lewat, kode uniknya dilepas untuk dipakai pelanggan lain.
          </p>
        </div>

        <div>
          <Label htmlFor="graceDays">Masa tenggang (hari)</Label>
          <Input
            id="graceDays"
            name="graceDays"
            type="number"
            min={0}
            max={30}
            defaultValue={settings.graceDays}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Waktu setelah jatuh tempo sebelum plan turun ke Gratis.
          </p>
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="paymentInstruction">Instruksi pembayaran</Label>
          <Textarea
            id="paymentInstruction"
            name="paymentInstruction"
            rows={3}
            maxLength={600}
            defaultValue={settings.paymentInstruction ?? ""}
          />
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Simpan pengaturan
      </Button>
    </form>
  );
}
