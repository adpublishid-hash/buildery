"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  LockKeyhole,
  MessageCircle,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  submitPaymentProofAction,
  type CheckoutInvoice,
} from "@/lib/actions/subscription";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/lib/upload-constants";
import { formatPrice } from "@/lib/utils";

type Props = {
  invoice: CheckoutInvoice | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Dialog pembayaran QRIS. Seluruh angka di sini datang dari invoice yang
 * sudah tersimpan di server — nomor, kode unik, dan nominalnya tetap sama
 * setiap kali dialog dibuka, karena itulah yang ditransfer pelanggan.
 */
export function PaymentDialog({ invoice, onOpenChange }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, startSubmit] = useTransition();
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setProofUrl(invoice?.proofUrl ?? null);
    setNote("");
    setSubmitted(invoice?.status === "AWAITING_VERIFICATION");
  }, [invoice?.id, invoice?.proofUrl, invoice?.status]);

  const open = Boolean(invoice);
  const remaining = useCountdown(invoice?.expiresAt ?? null);

  async function upload(file: File) {
    if (!invoice) return;
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
      body.append("invoiceId", invoice.id);
      const res = await fetch("/api/billing/proof", { method: "POST", body });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        toast.error(json.error ?? "Gagal mengunggah bukti transfer.");
        return;
      }
      setProofUrl(json.url);
      toast.success("Bukti transfer terunggah. Tinggal kirim untuk diverifikasi.");
    } catch {
      toast.error("Gagal mengunggah bukti transfer.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function submitProof() {
    if (!invoice || !proofUrl) return;
    startSubmit(async () => {
      const res = await submitPaymentProofAction({
        invoiceId: invoice.id,
        proofUrl,
        note,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSubmitted(true);
      toast.success("Bukti terkirim. Admin memverifikasi maksimal 1x24 jam.");
      router.refresh();
    });
  }

  const whatsappUrl = invoice?.whatsappNumber
    ? `https://wa.me/${invoice.whatsappNumber}?text=${encodeURIComponent(
        [
          "Halo admin, saya sudah membayar upgrade My Landing.",
          "",
          `Plan: ${invoice.planName}`,
          `Invoice: ${invoice.number}`,
          `Total transfer: ${formatPrice(invoice.totalAmount)}`,
          "",
          "Bukti transfer sudah saya unggah di halaman billing.",
        ].join("\n")
      )}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto overflow-x-hidden p-0 sm:max-w-xl">
        <div className="flex items-center gap-3 border-b border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-950">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900">
            <LockKeyhole className="h-5 w-5" />
          </span>
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl text-zinc-950 dark:text-white">
              Pembayaran {invoice?.planName ?? "plan"}
            </DialogTitle>
            <DialogDescription>
              Transfer tepat sampai digit terakhir, lalu unggah bukti transfer.
            </DialogDescription>
          </DialogHeader>
        </div>

        {invoice ? (
          <div className="bg-zinc-50/70 px-6 py-6 dark:bg-zinc-900/30">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-sm text-zinc-600 dark:text-zinc-300">
                {invoice.number}
              </p>
              {remaining ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                  <Clock className="h-3.5 w-3.5" />
                  Berlaku {remaining}
                </span>
              ) : (
                <span className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-500 dark:border-zinc-800">
                  Masa bayar habis
                </span>
              )}
            </div>

            {invoice.warnings.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
                <p className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-100">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Plan ini lebih kecil dari pemakaianmu sekarang
                </p>
                <ul className="mt-2 space-y-1 text-sm text-amber-800/90 dark:text-amber-200/80">
                  {invoice.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <dl className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                {invoice.listPrice > invoice.promoPrice ? (
                  <Row
                    label="Harga normal"
                    value={formatPrice(invoice.listPrice)}
                    strike
                  />
                ) : null}
                <Row
                  label="Harga plan"
                  value={formatPrice(invoice.promoPrice)}
                />
                {invoice.proratedCredit > 0 ? (
                  <Row
                    label="Potongan sisa plan lama"
                    value={`-${formatPrice(invoice.proratedCredit)}`}
                    accent
                  />
                ) : null}
                <Row
                  label="Kode unik"
                  value={`+${invoice.uniqueCode.toLocaleString("id-ID")}`}
                  accent
                />
              </dl>
              <div className="flex flex-col gap-3 border-t border-zinc-200 p-4 dark:border-zinc-800 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                    Total transfer
                  </p>
                  <p className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
                    {formatPrice(invoice.totalAmount)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard
                      ?.writeText(String(invoice.totalAmount))
                      .then(() => toast.success("Nominal disalin"))
                      .catch(() => toast.error("Gagal menyalin"));
                  }}
                >
                  <Copy className="h-4 w-4" />
                  Salin nominal
                </Button>
              </div>
            </div>

            {invoice.qrisImageUrl ? (
              <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-5 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  QRIS {invoice.qrisMerchantName ?? ""}
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                  {invoice.paymentInstruction ??
                    "Gunakan e-wallet atau mobile banking yang mendukung QRIS."}
                </p>
                <div className="mx-auto mt-5 w-full max-w-[18rem] rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={invoice.qrisImageUrl}
                    alt="QRIS pembayaran"
                    className="h-auto w-full rounded-xl"
                  />
                </div>
              </div>
            ) : (
              <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                QRIS belum dikonfigurasi admin. Hubungi kami untuk instruksi
                pembayaran.
              </p>
            )}

            <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              {submitted ? (
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      Bukti transfer sedang diverifikasi
                    </p>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      Plan aktif otomatis setelah admin menyetujui. Kamu akan
                      menerima email konfirmasi.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    Unggah bukti transfer
                  </p>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    Screenshot struk QRIS. PNG/JPG/WEBP, maks 5 MB.
                  </p>

                  {proofUrl ? (
                    <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={proofUrl}
                        alt="Bukti transfer"
                        className="max-h-56 w-full object-contain"
                      />
                    </div>
                  ) : null}

                  <input
                    ref={fileRef}
                    type="file"
                    accept={ALLOWED_IMAGE_TYPES.join(",")}
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void upload(file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 w-full"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {uploading
                      ? "Mengunggah…"
                      : proofUrl
                        ? "Ganti bukti transfer"
                        : "Pilih bukti transfer"}
                  </Button>

                  <div className="mt-3">
                    <Label htmlFor="proof-note" className="text-xs">
                      Catatan untuk admin (opsional)
                    </Label>
                    <Textarea
                      id="proof-note"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="Nama pengirim, bank, jam transfer…"
                      className="mt-1"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}

        <div className="border-t border-zinc-200 bg-zinc-50 px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900/40">
          {!submitted ? (
            <Button
              type="button"
              size="lg"
              className="h-12 w-full bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={!proofUrl || submitting}
              onClick={submitProof}
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              Kirim untuk verifikasi
            </Button>
          ) : null}

          {whatsappUrl ? (
            <Button asChild variant="outline" className="mt-2 w-full">
              <a href={whatsappUrl} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" />
                Hubungi admin via WhatsApp
              </a>
            </Button>
          ) : null}

          <DialogClose asChild>
            <Button type="button" variant="ghost" className="mt-2 w-full">
              Tutup
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  strike,
  accent,
}: {
  label: string;
  value: string;
  strike?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd
        className={[
          "font-medium",
          strike
            ? "text-zinc-400 line-through"
            : accent
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-zinc-900 dark:text-zinc-100",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

/** Sisa waktu bayar, dihitung ulang tiap menit selama dialog terbuka. */
function useCountdown(expiresAt: string | null) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!expiresAt) {
      setLabel(null);
      return;
    }
    const target = new Date(expiresAt).getTime();

    function tick() {
      const diff = target - Date.now();
      if (diff <= 0) {
        setLabel(null);
        return;
      }
      const hours = Math.floor(diff / (60 * 60 * 1000));
      const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
      setLabel(hours > 0 ? `${hours} jam ${minutes} menit` : `${minutes} menit`);
    }

    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  return label;
}
