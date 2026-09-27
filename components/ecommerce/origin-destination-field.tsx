"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";

import { searchDestinationsAdminAction } from "@/lib/actions/rajaongkir";
import type { Destination } from "@/lib/actions/rajaongkir";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type Props = {
  defaultId?: string;
  defaultName?: string;
  disabled?: boolean;
};

/**
 * Admin origin-address picker. Searches Komerce destinations and writes the
 * chosen id/label into hidden inputs the surrounding <form> submits by name
 * (shippingOriginCityId / shippingOriginCityName).
 */
export function OriginDestinationField({
  defaultId = "",
  defaultName = "",
  disabled = false,
}: Props) {
  const [id, setId] = useState(defaultId);
  const [name, setName] = useState(defaultName);
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasSelection = Boolean(id);

  useEffect(() => {
    if (hasSelection) return;
    const q = keyword.trim();
    if (q.length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      const res = await searchDestinationsAdminAction(q);
      setLoading(false);
      if (res.ok) {
        setResults(res.data);
        setOpen(true);
      } else {
        setResults([]);
        setOpen(false);
        setError(res.error);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [keyword, hasSelection]);

  function pick(d: Destination) {
    setId(d.id);
    setName(d.label);
    setKeyword("");
    setResults([]);
    setOpen(false);
    setError(null);
  }

  function clear() {
    setId("");
    setName("");
    setKeyword("");
    setResults([]);
    setError(null);
  }

  return (
    <div className="space-y-2">
      <Label>Alamat asal pengiriman</Label>
      {/* Submitted by the surrounding form. */}
      <input type="hidden" name="shippingOriginCityId" value={id} />
      <input type="hidden" name="shippingOriginCityName" value={name} />

      {hasSelection ? (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm">
          <div className="flex min-w-0 items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
            <div className="min-w-0">
              <p className="truncate font-medium text-zinc-900">{name}</p>
              <p className="text-[11px] text-zinc-500">Destination ID: {id}</p>
            </div>
          </div>
          {!disabled ? (
            <button
              type="button"
              onClick={clear}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white hover:text-zinc-900"
              aria-label="Ganti alamat asal"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Cari kota/kecamatan asal (min. 3 huruf)"
            className="pl-9"
            disabled={disabled}
            autoComplete="off"
          />
          {loading ? (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-400" />
          ) : null}
          {open && results.length > 0 ? (
            <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
              {results.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => pick(d)}
                    className="block w-full px-3 py-2 text-left text-sm transition hover:bg-zinc-50"
                  >
                    <span className="block font-medium text-zinc-900">
                      {d.label}
                    </span>
                    {d.zipCode ? (
                      <span className="block text-[11px] text-zinc-500">
                        Kode pos {d.zipCode} · ID {d.id}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : open && !loading ? (
            <p className="absolute left-0 right-0 top-full z-30 mt-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500 shadow-lg">
              Tidak ada alamat ditemukan.
            </p>
          ) : null}
        </div>
      )}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <p className="text-xs text-zinc-500">
        Cari & pilih lokasi asal pengiriman. Butuh API key Komerce yang sudah
        tersimpan terlebih dulu.
      </p>
    </div>
  );
}
