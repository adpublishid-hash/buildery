"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { FileText, Loader2, Paperclip, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

import { requestOrderReturnAction } from "@/lib/actions/order";
import {
  MAX_RETURN_NOTE_LENGTH,
  MAX_RETURN_REASON_LENGTH,
} from "@/lib/public-return-limits";
import {
  ALLOWED_EVIDENCE_LABEL,
  ALLOWED_EVIDENCE_TYPES,
  MAX_EVIDENCE_FILES,
} from "@/lib/upload-constants";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ReturnItem = {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
  refundableQuantity: number;
  restockableQuantity: number;
  isPhysical: boolean;
};

type EvidenceFile = {
  url: string;
  name: string;
  mimeType: string;
  size: number;
};

type Props = {
  workspaceSlug: string;
  orderNumber: string;
  orderId: string;
  accessToken?: string;
  orderTotal: number;
  items: ReturnItem[];
};

export function ReturnRequestForm({
  workspaceSlug,
  orderNumber,
  orderId,
  accessToken,
  orderTotal,
  items,
}: Props) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [restockQuantities, setRestockQuantities] = useState<Record<string, number>>({});
  const [amount, setAmount] = useState("");
  const [evidence, setEvidence] = useState<EvidenceFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const selectedItems = useMemo(
    () =>
      items
        .map((item) => {
          const quantity = clampQuantity(
            quantities[item.id] ?? 0,
            item.refundableQuantity
          );
          const restockQuantity = item.isPhysical
            ? clampQuantity(
                restockQuantities[item.id] ?? quantity,
                Math.min(quantity, item.restockableQuantity)
              )
            : 0;
          return { orderItemId: item.id, quantity, restockQuantity };
        })
        .filter((item) => item.quantity > 0 || item.restockQuantity > 0),
    [items, quantities, restockQuantities]
  );

  const suggestedAmount = useMemo(() => {
    const lineTotal = selectedItems.reduce((sum, selected) => {
      const item = items.find((candidate) => candidate.id === selected.orderItemId);
      return sum + (item ? item.unitPrice * selected.quantity : 0);
    }, 0);
    return Math.min(orderTotal, lineTotal || 0);
  }, [items, orderTotal, selectedItems]);

  function setItemQuantity(item: ReturnItem, value: number) {
    const next = clampQuantity(value, item.refundableQuantity);
    setQuantities((current) => ({ ...current, [item.id]: next }));
    if (!item.isPhysical) return;
    setRestockQuantities((current) => ({
      ...current,
      [item.id]: clampQuantity(current[item.id] ?? next, Math.min(next, item.restockableQuantity)),
    }));
  }

  function setItemRestockQuantity(item: ReturnItem, value: number) {
    const selected = quantities[item.id] ?? 0;
    setRestockQuantities((current) => ({
      ...current,
      [item.id]: clampQuantity(value, Math.min(selected, item.restockableQuantity)),
    }));
  }

  /**
   * Files go up one at a time before the form is submitted: a server action
   * body is far smaller than an image, so the action only ever carries the
   * metadata this returns.
   */
  async function uploadEvidence(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_EVIDENCE_FILES - evidence.length;
    if (room <= 0) {
      toast.error(`Maksimal ${MAX_EVIDENCE_FILES} file bukti.`);
      return;
    }

    setUploading(true);
    const uploaded: EvidenceFile[] = [];
    try {
      for (const file of Array.from(files).slice(0, room)) {
        const body = new FormData();
        body.set("file", file);
        body.set("accessToken", accessToken ?? "");
        const response = await fetch(
          `/api/site/orders/${orderId}/return-evidence`,
          { method: "POST", body }
        );
        const payload = (await response.json().catch(() => null)) as
          | (EvidenceFile & { error?: string })
          | null;
        if (!response.ok || !payload?.url) {
          toast.error(payload?.error ?? `Gagal mengunggah ${file.name}.`);
          continue;
        }
        uploaded.push({
          url: payload.url,
          name: payload.name,
          mimeType: payload.mimeType,
          size: payload.size,
        });
      }
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }

    if (uploaded.length > 0) {
      setEvidence((current) => [...current, ...uploaded]);
      toast.success(`${uploaded.length} bukti terlampir`);
    }
  }

  function removeEvidence(url: string) {
    setEvidence((current) => current.filter((file) => file.url !== url));
  }

  function submit(formData: FormData) {
    formData.set("items", JSON.stringify(selectedItems));
    formData.set("evidence", JSON.stringify(evidence));
    formData.set(
      "amount",
      String(Math.max(0, Math.floor(Number(amount) || suggestedAmount)))
    );
    startTransition(async () => {
      const result = await requestOrderReturnAction(
        workspaceSlug,
        orderNumber,
        accessToken,
        formData
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Request terkirim");
      setEvidence([]);
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left">
        <p className="text-sm font-semibold text-emerald-950">
          Request sudah diterima
        </p>
        <p className="mt-1 text-sm text-emerald-800">
          Tim toko akan meninjau refund/return ini dan statusnya akan muncul di
          halaman order.
        </p>
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-4 text-left">
      <input type="hidden" name="items" value="[]" />
      <div className="rounded-xl border border-zinc-200 p-4">
        <p className="text-sm font-semibold text-zinc-900">Item yang diajukan</p>
        <div className="mt-3 divide-y divide-zinc-100">
          {items.map((item) => {
            const selected = quantities[item.id] ?? 0;
            const restock = item.isPhysical
              ? restockQuantities[item.id] ?? selected
              : 0;
            return (
              <div key={item.id} className="grid gap-3 py-3 sm:grid-cols-[1fr_92px_92px] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900">
                    {item.name}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatPrice(item.unitPrice)} × {item.quantity} · sisa{" "}
                    {item.refundableQuantity}
                  </p>
                </div>
                <label className="text-xs font-medium text-zinc-500">
                  Refund
                  <Input
                    className="mt-1 h-9"
                    min={0}
                    max={item.refundableQuantity}
                    type="number"
                    value={selected}
                    onChange={(event) =>
                      setItemQuantity(item, Number(event.target.value))
                    }
                  />
                </label>
                <label className="text-xs font-medium text-zinc-500">
                  Restock
                  <Input
                    className="mt-1 h-9"
                    disabled={!item.isPhysical || selected === 0}
                    min={0}
                    max={Math.min(selected, item.restockableQuantity)}
                    type="number"
                    value={restock}
                    onChange={(event) =>
                      setItemRestockQuantity(item, Number(event.target.value))
                    }
                  />
                </label>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 p-4">
        <label className="text-sm font-medium text-zinc-900">
          Nominal refund
          <Input
            className="mt-2"
            inputMode="numeric"
            min={0}
            max={orderTotal}
            name="amount"
            placeholder={suggestedAmount ? String(suggestedAmount) : "0"}
            type="number"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <p className="mt-2 text-xs text-zinc-500">
          Estimasi dari item: {formatPrice(suggestedAmount)}. Maksimum{" "}
          {formatPrice(orderTotal)}.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 p-4">
        <label className="text-sm font-medium text-zinc-900">
          Alasan
          <Textarea
            className="mt-2"
            maxLength={MAX_RETURN_REASON_LENGTH}
            name="reason"
            placeholder="Contoh: ukuran tidak sesuai, barang rusak, atau ingin refund."
            required
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-zinc-900">
          Catatan tambahan
          <Textarea
            className="mt-2"
            maxLength={MAX_RETURN_NOTE_LENGTH}
            name="note"
            placeholder="Nomor resi return atau detail lain bila ada."
          />
        </label>
      </div>

      <div className="rounded-xl border border-zinc-200 p-4">
        <p className="text-sm font-medium text-zinc-900">Bukti pendukung</p>
        <p className="mt-1 text-xs text-zinc-500">
          Foto barang rusak, bukti kirim balik, atau resi return.{" "}
          {ALLOWED_EVIDENCE_LABEL}.
        </p>

        {evidence.length > 0 && (
          <ul className="mt-3 space-y-2">
            {evidence.map((file) => (
              <li
                key={file.url}
                className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2"
              >
                <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                <a
                  className="min-w-0 flex-1 truncate text-xs text-zinc-700 hover:underline"
                  href={file.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {file.name}
                </a>
                <span className="shrink-0 text-xs text-zinc-400">
                  {formatFileSize(file.size)}
                </span>
                <button
                  aria-label={`Hapus ${file.name}`}
                  className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                  onClick={() => removeEvidence(file.url)}
                  type="button"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <input
          accept={ALLOWED_EVIDENCE_TYPES.join(",")}
          className="hidden"
          multiple
          onChange={(event) => uploadEvidence(event.target.files)}
          ref={fileInput}
          type="file"
        />
        <Button
          className="mt-3"
          disabled={uploading || evidence.length >= MAX_EVIDENCE_FILES}
          onClick={() => fileInput.current?.click()}
          size="sm"
          type="button"
          variant="outline"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Paperclip className="h-4 w-4" />
          )}
          {evidence.length >= MAX_EVIDENCE_FILES
            ? `Maksimal ${MAX_EVIDENCE_FILES} file`
            : "Lampirkan bukti"}
        </Button>
      </div>

      <Button
        className="w-full"
        disabled={pending || uploading || selectedItems.length === 0}
        type="submit"
      >
        <RotateCcw className="h-4 w-4" />
        Kirim request
      </Button>
    </form>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function clampQuantity(value: number, max: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), Math.max(0, max));
}
