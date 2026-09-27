"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Banknote,
  Check,
  CreditCard,
  Loader2,
  Lock,
  MapPin,
  Search,
  Truck,
  Wallet,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createOrderAction } from "@/lib/actions/order";
import {
  searchDestinationsAction,
  calculateShippingAction,
  type Destination,
  type ShippingOption,
} from "@/lib/actions/rajaongkir";
import { trackMetaEvent } from "@/lib/meta-client";
import type { MetaCustomData } from "@/lib/meta-capi";
import { startPayment } from "@/lib/payment-client";
import { publicSiteHref } from "@/lib/public-url";
import { formatPrice } from "@/lib/utils";
import { checkoutSchema, type CheckoutInput } from "@/lib/zod";

type Props = {
  workspaceId: string;
  workspaceSlug: string;
  sellerNoteEnabled?: boolean;
  metaCheckoutData?: MetaCustomData;
  shippingEnabled?: boolean;
  hasPhysical?: boolean;
  subtotal?: number;
  flatRateEnabled?: boolean;
  flatRateName?: string;
  flatRateCost?: number;
  freeShippingEnabled?: boolean;
  freeShippingMinimum?: number;
  pickupEnabled?: boolean;
  cod?: { enabled: boolean; fee: number; minimum: number; maximum: number | null };
  /** Addresses this customer has shipped to before. */
  savedAddresses?: {
    id: string;
    label: string | null;
    recipientName: string;
    recipientPhone: string;
    provinceId: string | null;
    provinceName: string | null;
    cityId: string | null;
    cityName: string | null;
    postalCode: string | null;
    address: string;
  }[];
  totalWeightGrams?: number;
  manualMethods?: {
    id: string;
    name: string;
    type: string;
    accountName: string | null;
    accountNumber: string | null;
    qrImageUrl: string | null;
    instructions: string | null;
  }[];
};

export function CheckoutForm({
  workspaceId,
  workspaceSlug,
  sellerNoteEnabled = true,
  metaCheckoutData,
  shippingEnabled = false,
  hasPhysical = false,
  subtotal = 0,
  flatRateEnabled = false,
  flatRateName = "Flat rate",
  flatRateCost = 0,
  freeShippingEnabled = false,
  freeShippingMinimum = 0,
  pickupEnabled = false,
  cod,
  savedAddresses = [],
  totalWeightGrams = 0,
  manualMethods = [],
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<"midtrans" | "manual" | "cod">(
    "midtrans"
  );
  const [paymentMethodId, setPaymentMethodId] = useState(
    manualMethods[0]?.id ?? ""
  );
  const freeShippingAvailable =
    freeShippingEnabled && subtotal >= freeShippingMinimum;
  const [shippingMethod, setShippingMethod] = useState<
    "AUTOMATIC" | "FLAT_RATE" | "FREE" | "PICKUP"
  >(
    freeShippingAvailable
      ? "FREE"
      : shippingEnabled
        ? "AUTOMATIC"
        : flatRateEnabled
          ? "FLAT_RATE"
          : "PICKUP"
  );
  // Mirrors the server's COD rules so the button can say why it is unavailable
  // instead of failing after the shopper commits.
  const codReason = !hasPhysical
    ? "Hanya untuk produk fisik"
    : shippingMethod === "PICKUP"
      ? "Tidak berlaku untuk ambil di lokasi"
      : cod && subtotal < cod.minimum
        ? `Minimum ${formatPrice(cod.minimum)}`
        : cod?.maximum != null && subtotal > cod.maximum
          ? `Maksimum ${formatPrice(cod.maximum)}`
          : "";
  const codAllowed = Boolean(cod?.enabled) && codReason === "";

  // Switching to store pickup, or emptying the cart of physical goods, can make
  // a chosen COD invalid; fall back rather than submit something refused.
  useEffect(() => {
    if (paymentMode === "cod" && !codAllowed) setPaymentMode("midtrans");
  }, [codAllowed, paymentMode]);

  /**
   * Fills the shipping fields from a saved address.
   *
   * The automatic-courier flow needs a destination object, which only its own
   * search produces; a saved address carries the id and the label it was
   * chosen with, which is enough to quote against.
   */
  function applySavedAddress(entry: NonNullable<Props["savedAddresses"]>[number]) {
    setRecipientName(entry.recipientName);
    setRecipientPhone(entry.recipientPhone);
    setAddress(entry.address);
    setPostalCode(entry.postalCode ?? "");
    const label = [entry.cityName, entry.provinceName].filter(Boolean).join(", ");
    setDestKeyword(label);
    if (entry.cityId) {
      setSelectedDest({
        id: entry.cityId,
        label: label || entry.cityName || "",
        province: entry.provinceName ?? "",
        city: entry.cityName ?? "",
        district: "",
        subdistrict: "",
        zipCode: entry.postalCode ?? "",
      });
    }
  }

  const checkoutRequestId = useRef<string | null>(null);

  // ── Shipping state (Komerce destination-search model) ───────────────────
  const [destKeyword, setDestKeyword] = useState("");
  const [destResults, setDestResults] = useState<Destination[]>([]);
  const [destLoading, setDestLoading] = useState(false);
  const [destOpen, setDestOpen] = useState(false);
  const [selectedDest, setSelectedDest] = useState<Destination | null>(null);
  const [postalCode, setPostalCode] = useState("");
  const [address, setAddress] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [shipOptions, setShipOptions] = useState<ShippingOption[]>([]);
  const [shipOptionKey, setShipOptionKey] = useState("");
  const [shipLoading, setShipLoading] = useState(false);
  const [shipError, setShipError] = useState<string | null>(null);
  const selectedShipping = shipOptions.find(
    (o) => `${o.courier}:${o.service}` === shipOptionKey
  );

  // Debounced destination search — only call the server when the user pauses
  // typing, so each keystroke doesn't burn an API call.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!shippingEnabled || shippingMethod !== "AUTOMATIC") return;
    if (selectedDest) return; // hide the dropdown once a pick is made
    const q = destKeyword.trim();
    if (q.length < 3) {
      setDestResults([]);
      setDestOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setDestLoading(true);
      setShipError(null);
      const res = await searchDestinationsAction(workspaceSlug, q);
      setDestLoading(false);
      if (res.ok) {
        setDestResults(res.data);
        setDestOpen(true);
      } else {
        setDestResults([]);
        setDestOpen(false);
        setShipError(res.error);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [destKeyword, shippingEnabled, shippingMethod, workspaceSlug, selectedDest]);

  const calculateShippingFor = useCallback(
    async (destinationId: string) => {
      setShipLoading(true);
      setShipError(null);
      const res = await calculateShippingAction(
        workspaceSlug,
        destinationId,
        totalWeightGrams || 1000
      );
      setShipLoading(false);
      if (res.ok) {
        setShipOptions(res.options);
        if (res.options[0]) {
          setShipOptionKey(`${res.options[0].courier}:${res.options[0].service}`);
        } else {
          setShipOptionKey("");
        }
      } else {
        setShipOptions([]);
        setShipOptionKey("");
        setShipError(res.error);
      }
    },
    [workspaceSlug, totalWeightGrams]
  );

  function onPickDestination(d: Destination) {
    setSelectedDest(d);
    setDestKeyword(d.label);
    setDestOpen(false);
    if (d.zipCode && !postalCode) setPostalCode(d.zipCode);
    calculateShippingFor(d.id);
  }

  function clearDestination() {
    setSelectedDest(null);
    setDestKeyword("");
    setDestResults([]);
    setShipOptions([]);
    setShipOptionKey("");
    setShipError(null);
  }

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CheckoutInput>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { name: "", email: "", phone: "", note: "" },
  });

  function onSubmit(values: CheckoutInput) {
    setServerError(null);
    if (hasPhysical && shippingMethod !== "PICKUP") {
      if (
        !address.trim() ||
        !recipientName.trim() ||
        !recipientPhone.trim() ||
        (shippingMethod === "AUTOMATIC" && (!selectedDest || !selectedShipping)) ||
        (shippingMethod !== "AUTOMATIC" && !destKeyword.trim())
      ) {
        setServerError("Lengkapi alamat pengiriman dan metode pengiriman.");
        return;
      }
    }
    const fd = new FormData();
    fd.set("name", values.name);
    fd.set("email", values.email);
    fd.set("phone", values.phone ?? "");
    fd.set("note", sellerNoteEnabled ? values.note ?? "" : "");
    fd.set("paymentMode", paymentMode);
    fd.set("paymentMethodId", paymentMethodId);
    if (!checkoutRequestId.current) checkoutRequestId.current = crypto.randomUUID();
    fd.set("checkoutRequestId", checkoutRequestId.current);
    fd.set("shippingMethodType", hasPhysical ? shippingMethod : "");
    fd.set(
      "shippingMethodName",
      shippingMethod === "FLAT_RATE"
        ? flatRateName
        : shippingMethod === "FREE"
          ? "Free shipping"
          : shippingMethod === "PICKUP"
            ? "Store pickup"
            : selectedShipping
              ? `${selectedShipping.courier.toUpperCase()} ${selectedShipping.service}`
              : ""
    );
    if (hasPhysical && shippingMethod !== "PICKUP") {
      fd.set("shippingPostalCode", postalCode);
      fd.set("shippingAddress", address);
      fd.set("shippingRecipientName", recipientName);
      fd.set("shippingRecipientPhone", recipientPhone);
    }
    if (shippingMethod === "AUTOMATIC" && selectedShipping && selectedDest) {
      // The order action still uses province/city naming, so we map the
      // Komerce destination breakdown onto the existing column shape.
      fd.set("shippingProvinceId", "");
      fd.set("shippingProvinceName", selectedDest.province);
      fd.set("shippingCityId", selectedDest.id);
      fd.set(
        "shippingCityName",
        [selectedDest.subdistrict, selectedDest.district, selectedDest.city]
          .filter(Boolean)
          .join(", ") || selectedDest.label
      );
      fd.set("shippingPostalCode", postalCode || selectedDest.zipCode);
      fd.set("shippingCourier", selectedShipping.courier);
      fd.set("shippingService", selectedShipping.service);
    } else if (hasPhysical && shippingMethod !== "PICKUP") {
      fd.set("shippingCityName", destKeyword);
    }

    startTransition(async () => {
      const res = await createOrderAction(workspaceId, fd);
      if (!res.ok) {
        setServerError(res.error);
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            if (msgs?.[0]) {
              setError(field as keyof CheckoutInput, { message: msgs[0] });
            }
          }
        }
        return;
      }
      if (res.data!.metaEvent) {
        trackMetaEvent({
          workspaceId,
          eventName: res.data!.metaEvent.eventName,
          eventId: res.data!.metaEvent.eventId,
          customData: res.data!.metaEvent.customData,
          sendServer: false,
        });
      } else if (metaCheckoutData) {
        trackMetaEvent({
          workspaceId,
          eventName: "AddPaymentInfo",
          customData: {
            ...metaCheckoutData,
            status: paymentMode,
          },
          // A repeated submit returns the existing order; its server event
          // was sent the first time, and an unsigned twin would be refused.
          sendServer: false,
        });
      }
      // Neither a manual transfer nor COD goes through a payment provider: one
      // is paid off-site, the other on the doorstep. Sending COD to the
      // provider settled the order the moment it was placed.
      if (res.data!.paymentMode === "manual" || res.data!.paymentMode === "cod") {
        router.push(
          `${publicSiteHref(workspaceSlug, "checkout/success")}?order=${encodeURIComponent(
            res.data!.orderNumber
          )}&access=${encodeURIComponent(res.data!.orderAccessToken)}`
        );
        return;
      }
      // Order placed as PENDING — start the Midtrans payment.
      const payment = await startPayment(
        res.data!.paymentId,
        res.data!.paymentAccessToken
      );
      if (!payment.ok) {
        setServerError(payment.error);
        return;
      }
      window.location.href = payment.url;
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Full name</Label>
        <Input id="name" {...register("name")} />
        {errors.name && (
          <p className="text-xs text-red-600">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" {...register("email")} />
        {errors.email && (
          <p className="text-xs text-red-600">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input id="phone" {...register("phone")} />
        {errors.phone && (
          <p className="text-xs text-red-600">{errors.phone.message}</p>
        )}
      </div>

      {sellerNoteEnabled ? (
        <div className="space-y-2">
          <Label htmlFor="note">Order note (optional)</Label>
          <Textarea id="note" rows={3} {...register("note")} />
        </div>
      ) : null}

      {hasPhysical ? (
        <div className="space-y-3 rounded-xl border border-zinc-200 p-4">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-zinc-500" />
            <p className="text-sm font-semibold text-zinc-900">Alamat & ongkir</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {freeShippingAvailable ? (
              <ShippingMethodButton
                active={shippingMethod === "FREE"}
                label="Gratis ongkir"
                detail={`Min. ${formatPrice(freeShippingMinimum)}`}
                onClick={() => setShippingMethod("FREE")}
              />
            ) : null}
            {shippingEnabled ? (
              <ShippingMethodButton
                active={shippingMethod === "AUTOMATIC"}
                label="Kurir otomatis"
                detail="Tarif sesuai tujuan"
                onClick={() => setShippingMethod("AUTOMATIC")}
              />
            ) : null}
            {flatRateEnabled ? (
              <ShippingMethodButton
                active={shippingMethod === "FLAT_RATE"}
                label={flatRateName}
                detail={formatPrice(flatRateCost)}
                onClick={() => setShippingMethod("FLAT_RATE")}
              />
            ) : null}
            {pickupEnabled ? (
              <ShippingMethodButton
                active={shippingMethod === "PICKUP"}
                label="Ambil di lokasi"
                detail="Tanpa ongkir"
                onClick={() => setShippingMethod("PICKUP")}
              />
            ) : null}
          </div>
          {shippingMethod !== "PICKUP" ? (
            <>
          {savedAddresses.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-700">Alamat tersimpan</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {savedAddresses.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    disabled={pending}
                    onClick={() => applySavedAddress(entry)}
                    className="rounded-lg border border-zinc-200 p-3 text-left text-xs transition hover:border-zinc-400"
                  >
                    <span className="block text-sm font-medium">
                      {entry.label || entry.recipientName}
                    </span>
                    <span className="mt-0.5 block text-zinc-500">
                      {entry.recipientPhone}
                    </span>
                    <span className="mt-1 block line-clamp-2 text-zinc-500">
                      {entry.address}
                      {entry.cityName ? `, ${entry.cityName}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="recipientName">Nama penerima</Label>
              <Input
                id="recipientName"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="recipientPhone">Telp penerima</Label>
              <Input
                id="recipientPhone"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="destSearch">Alamat tujuan</Label>
            {shippingMethod !== "AUTOMATIC" ? (
              <Input
                id="destSearch"
                value={destKeyword}
                onChange={(e) => setDestKeyword(e.target.value)}
                placeholder="Kota, kecamatan, provinsi"
                disabled={pending}
              />
            ) : selectedDest ? (
              <div className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm">
                <div className="flex min-w-0 items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900">
                      {selectedDest.label}
                    </p>
                    {selectedDest.zipCode ? (
                      <p className="text-[11px] text-zinc-500">
                        Kode pos {selectedDest.zipCode}
                      </p>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearDestination}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white hover:text-zinc-900"
                  aria-label="Ganti alamat"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  id="destSearch"
                  value={destKeyword}
                  onChange={(e) => setDestKeyword(e.target.value)}
                  onFocus={() => destResults.length > 0 && setDestOpen(true)}
                  placeholder="Ketik nama kelurahan, kecamatan, atau kota (min. 3 huruf)"
                  className="pl-9"
                  disabled={pending}
                  autoComplete="off"
                />
                {destLoading ? (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-400" />
                ) : null}
                {destOpen && destResults.length > 0 ? (
                  <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
                    {destResults.map((d) => (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => onPickDestination(d)}
                          className="block w-full px-3 py-2 text-left text-sm transition hover:bg-zinc-50"
                        >
                          <span className="block font-medium text-zinc-900">
                            {d.label}
                          </span>
                          {d.zipCode ? (
                            <span className="block text-[11px] text-zinc-500">
                              Kode pos {d.zipCode}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : destOpen && !destLoading ? (
                  <p className="absolute left-0 right-0 top-full z-30 mt-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500 shadow-lg">
                    Tidak ada alamat ditemukan untuk &ldquo;{destKeyword}&rdquo;.
                  </p>
                ) : null}
              </div>
            )}
            {shippingMethod === "AUTOMATIC" ? (
              <p className="text-[11px] text-zinc-500">
                Cari berdasarkan kelurahan, kecamatan, atau kota. Ongkir dihitung otomatis.
              </p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <div className="space-y-1.5">
              <Label htmlFor="address">Alamat lengkap</Label>
              <Textarea
                id="address"
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={pending}
                placeholder="Nama jalan, RT/RW, kelurahan, dst."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="postalCode">Kode Pos</Label>
              <Input
                id="postalCode"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>

          {shippingMethod === "AUTOMATIC" ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-zinc-700">Pilih kurir</p>
              {shipLoading ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
                  <Loader2 className="h-3 w-3 animate-spin" /> menghitung…
                </span>
              ) : null}
            </div>
            {shipError ? (
              <p className="mt-2 text-xs text-red-600">{shipError}</p>
            ) : null}
            {!selectedDest && !shipLoading ? (
              <p className="mt-2 text-xs text-zinc-500">
                Pilih alamat tujuan dulu untuk melihat ongkir.
              </p>
            ) : null}
            {shipOptions.length > 0 ? (
              <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
                {shipOptions.map((o) => {
                  const k = `${o.courier}:${o.service}`;
                  const sel = shipOptionKey === k;
                  return (
                    <label
                      key={k}
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-md border p-2 text-sm ${
                        sel ? "border-zinc-950 bg-white" : "border-zinc-200 bg-white"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={sel}
                          onChange={() => setShipOptionKey(k)}
                          className="sr-only"
                        />
                        {sel ? <Check className="h-4 w-4" /> : <span className="h-4 w-4" />}
                        <span>
                          <span className="font-medium uppercase">{o.courier}</span>{" "}
                          <span className="text-xs text-zinc-500">{o.service}</span>
                          {o.etd ? (
                            <span className="ml-2 text-[11px] text-zinc-400">
                              {o.etd} hari
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className="text-sm font-semibold">
                        {formatPrice(o.cost)}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : null}
            {selectedShipping ? (
              <p className="mt-2 text-[11px] text-zinc-500">
                Ongkir <span className="font-semibold text-zinc-700">{formatPrice(selectedShipping.cost)}</span> akan ditambahkan ke total.
              </p>
            ) : null}
          </div>
          ) : null}
            </>
          ) : (
            <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
              Pesanan diambil di lokasi toko. Detail pickup akan dikonfirmasi penjual.
            </p>
          )}
        </div>
      ) : null}

      <div className="space-y-3 rounded-xl border border-zinc-200 p-4">
        <div>
          <p className="text-sm font-semibold text-zinc-900">
            Metode pembayaran
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Bayar otomatis, transfer manual, atau bayar di tempat.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setPaymentMode("midtrans")}
            className={`flex items-start gap-3 rounded-lg border p-3 text-left ${
              paymentMode === "midtrans"
                ? "border-zinc-950 ring-1 ring-zinc-950"
                : "border-zinc-200"
            }`}
          >
            <CreditCard className="mt-0.5 h-4 w-4" />
            <span>
              <span className="block text-sm font-medium">Bayar otomatis</span>
              <span className="text-xs text-zinc-500">Midtrans / sandbox</span>
            </span>
          </button>
          <button
            type="button"
            disabled={manualMethods.length === 0}
            onClick={() => manualMethods.length > 0 && setPaymentMode("manual")}
            className={`flex items-start gap-3 rounded-lg border p-3 text-left disabled:opacity-50 ${
              paymentMode === "manual"
                ? "border-zinc-950 ring-1 ring-zinc-950"
                : "border-zinc-200"
            }`}
          >
            <Wallet className="mt-0.5 h-4 w-4" />
            <span>
              <span className="block text-sm font-medium">Transfer manual</span>
              <span className="text-xs text-zinc-500">
                {manualMethods.length > 0
                  ? `${manualMethods.length} metode tersedia`
                  : "Belum diatur"}
              </span>
            </span>
          </button>
          {cod?.enabled ? (
            <button
              type="button"
              disabled={!codAllowed}
              onClick={() => codAllowed && setPaymentMode("cod")}
              className={`flex items-start gap-3 rounded-lg border p-3 text-left disabled:opacity-50 ${
                paymentMode === "cod"
                  ? "border-zinc-950 ring-1 ring-zinc-950"
                  : "border-zinc-200"
              }`}
            >
              <Banknote className="mt-0.5 h-4 w-4" />
              <span>
                <span className="block text-sm font-medium">Bayar di tempat (COD)</span>
                <span className="text-xs text-zinc-500">
                  {codAllowed
                    ? cod.fee > 0
                      ? `Biaya COD ${formatPrice(cod.fee)}`
                      : "Bayar ke kurir saat barang sampai"
                    : codReason}
                </span>
              </span>
            </button>
          ) : null}
        </div>
        {paymentMode === "cod" ? (
          <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600">
            Bayar tunai ke kurir saat barang sampai. Pesanan ini tidak
            kedaluwarsa, jadi tidak perlu membayar sekarang.
          </p>
        ) : null}
        {paymentMode === "manual" && manualMethods.length > 0 ? (
          <div className="space-y-2">
            {manualMethods.map((method) => {
              const selected = paymentMethodId === method.id;
              return (
                <label
                  key={method.id}
                  className={`block cursor-pointer rounded-lg border p-3 ${
                    selected
                      ? "border-zinc-950 bg-zinc-50"
                      : "border-zinc-200"
                  }`}
                >
                  <input
                    type="radio"
                    checked={selected}
                    onChange={() => setPaymentMethodId(method.id)}
                    className="sr-only"
                  />
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{method.name}</span>
                    {selected ? <Check className="h-4 w-4" /> : null}
                  </span>
                  <span className="mt-1 block text-xs text-zinc-500">
                    {method.type === "QRIS"
                      ? "Scan kode QRIS untuk membayar."
                      : [method.accountName, method.accountNumber]
                          .filter(Boolean)
                          .join(" - ") || "Instruksi pembayaran tersedia setelah order dibuat."}
                  </span>
                  {selected && method.type === "QRIS" && method.qrImageUrl ? (
                    <span className="mt-2 flex items-center justify-center rounded-md bg-white p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={method.qrImageUrl}
                        alt="QRIS"
                        className="h-44 w-44 object-contain"
                      />
                    </span>
                  ) : null}
                  {selected && method.instructions ? (
                    <span className="mt-2 block rounded-md bg-white px-3 py-2 text-xs leading-5 text-zinc-600">
                      {method.instructions}
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
        ) : null}
      </div>

      {serverError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {serverError}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Lock />}
        {pending
          ? "Memproses..."
          : paymentMode === "midtrans"
            ? "Bayar Sekarang"
            : "Buat Pesanan"}
      </Button>
      <p className="text-center text-[11px] text-zinc-400">
        Email order dikirim otomatis setelah checkout tersimpan.
      </p>
    </form>
  );
}

function ShippingMethodButton({
  active,
  label,
  detail,
  onClick,
}: {
  active: boolean;
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm ${
        active ? "border-zinc-950 ring-1 ring-zinc-950" : "border-zinc-200"
      }`}
    >
      <span className="font-medium">{label}</span>
      <span className="text-xs text-zinc-500">{detail}</span>
    </button>
  );
}
