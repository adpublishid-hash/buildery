"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CreditCard,
  Loader2,
  MapPin,
  Package,
  Plus,
  QrCode,
  ReceiptText,
  Settings2,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
  Truck,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type {
  EcommerceSetting,
  ManualPaymentMethod,
  PickupLocation,
} from "@prisma/client";

import {
  createManualPaymentMethodAction,
  createPickupLocationAction,
  deleteManualPaymentMethodAction,
  deletePickupLocationAction,
  updateManualPaymentMethodAction,
  updateEcommerceSettingsAction,
} from "@/lib/actions/ecommerce-settings";
import { cn } from "@/lib/utils";
import { OriginDestinationField } from "@/components/ecommerce/origin-destination-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditorSection } from "@/components/dashboard/editor-shell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { EcommerceSecretField } from "@/lib/secret-fields";
import { SETTINGS_VERSION_FIELD } from "@/lib/settings-version";
import { ConnectionTestButton } from "@/components/settings/connection-test-button";

type Props = {
  /**
   * The Midtrans keys are stripped before this reaches the browser; only
   * hints of whether each is stored come through.
   */
  setting: Omit<EcommerceSetting, EcommerceSecretField>;
  secretHints: Record<EcommerceSecretField, string | null>;
  manualMethods: ManualPaymentMethod[];
  pickupLocations: PickupLocation[];
  workspaceName: string;
  embedded?: boolean;
  canEdit?: boolean;
};

const tabs = [
  { id: "general", label: "Umum", icon: SlidersHorizontal },
  { id: "checkout", label: "Checkout", icon: ShoppingCart },
  { id: "payments", label: "Pembayaran", icon: CreditCard },
  { id: "shipping", label: "Pengiriman", icon: Truck },
  { id: "tax", label: "Pajak & Invoice", icon: ReceiptText },
  { id: "stock", label: "Stok", icon: Package },
  { id: "sound", label: "Suara order", icon: Bell },
] as const;

function HiddenSwitch({
  name,
  checked,
  onCheckedChange,
  disabled,
}: {
  name: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <input type="hidden" name={name} value={String(checked)} />
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </>
  );
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-[16px] border-b border-black/[0.06] py-[12px] last:border-b-0">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-kv-fg">{title}</p>
        <p className="mt-[2px] max-w-2xl text-[12px] leading-[1.5] text-kv-muted-fg">{description}</p>
      </div>
      {children}
    </div>
  );
}

/** The save action of one tab, pinned to the bottom while its fields scroll. */
function SaveBar({ canEdit }: { canEdit: boolean }) {
  if (!canEdit) return null;
  return (
    <div className="sticky bottom-[12px] z-10 flex items-center justify-between gap-[12px] rounded-[10px] border-[0.8px] border-kv-border bg-kv-card/95 px-[12px] py-[8px] shadow-kv-soft backdrop-blur">
      <p className="min-w-0 truncate text-[12px] text-kv-muted-fg">Semua isian di tab ini disimpan bersama.</p>
      <SaveButton canEdit={canEdit}>Simpan pengaturan</SaveButton>
    </div>
  );
}

function SaveButton({
  children = "Simpan Pengaturan",
  canEdit = true,
}: {
  children?: string;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="submit"
      size="sm"
      disabled={pending || !canEdit}
      formAction={(formData) =>
        startTransition(async () => {
          // Hasilnya dulu dibuang, jadi penolakan izin, konflik penyimpanan,
          // dan galat validasi sama-sama berakhir senyap: halaman ter-refresh
          // seolah tersimpan.
          const res = await updateEcommerceSettingsAction(formData);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Pengaturan tersimpan");
          router.refresh();
        })
      }
    >
      {pending ? "Menyimpan..." : children}
    </Button>
  );
}

/**
 * Menandai versi baris saat form dimuat, supaya penyimpanan yang berangkat
 * dari data basi bisa ditolak alih-alih menimpa perubahan orang lain.
 */
function SectionFields({
  section,
  loadedAt,
}: {
  section: string;
  loadedAt: string;
}) {
  return (
    <>
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name={SETTINGS_VERSION_FIELD} value={loadedAt} />
    </>
  );
}

export function EcommerceSettingsForm({
  setting,
  manualMethods,
  pickupLocations,
  workspaceName,
  embedded = false,
  canEdit = true,
  secretHints,
}: Props) {
  const router = useRouter();
  const loadedAt = new Date(setting.updatedAt).toISOString();
  const [active, setActive] = useState<(typeof tabs)[number]["id"]>("general");
  const [symbolPosition, setSymbolPosition] = useState(
    setting.currencySymbolPosition
  );
  const [thousandSeparator, setThousandSeparator] = useState(
    setting.thousandSeparator
  );
  const [decimalSeparator, setDecimalSeparator] = useState(
    setting.decimalSeparator
  );
  const [decimalPlaces, setDecimalPlaces] = useState(setting.decimalPlaces);
  const [midtransEnabled, setMidtransEnabled] = useState(
    setting.midtransEnabled
  );
  const [midtransIsProduction, setMidtransIsProduction] = useState(
    setting.midtransIsProduction
  );
  const [prefix, setPrefix] = useState(
    setting.orderNumberPrefix || workspaceName.slice(0, 6).toUpperCase()
  );
  const [requireLogin, setRequireLogin] = useState(
    setting.checkoutRequireLogin
  );
  const [autoAccount, setAutoAccount] = useState(
    setting.checkoutAutoCreateAccount
  );
  const [couponEnabled, setCouponEnabled] = useState(
    setting.checkoutCouponEnabled
  );
  const [noteEnabled, setNoteEnabled] = useState(
    setting.checkoutSellerNoteEnabled
  );
  const [soundNew, setSoundNew] = useState(setting.orderSoundNew);
  const [soundPaid, setSoundPaid] = useState(setting.orderSoundPaid);
  const [flatRateEnabled, setFlatRateEnabled] = useState(setting.flatRateEnabled);
  const [freeShippingEnabled, setFreeShippingEnabled] = useState(
    setting.freeShippingEnabled
  );
  const [pickupEnabled, setPickupEnabled] = useState(setting.pickupEnabled);
  const [codEnabled, setCodEnabled] = useState(setting.codEnabled);
  const [taxEnabled, setTaxEnabled] = useState(setting.taxEnabled);
  const [pricesIncludeTax, setPricesIncludeTax] = useState(
    setting.pricesIncludeTax
  );

  const pricePreview = useMemo(() => {
    const amount = 1234567;
    const fixed = amount.toFixed(decimalPlaces);
    const [whole, decimal] = fixed.split(".");
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, thousandSeparator);
    const value =
      decimalPlaces > 0 && decimal
        ? `${grouped}${decimalSeparator}${decimal}`
        : grouped;
    if (symbolPosition === "RIGHT") return `${value}${setting.currencySymbol}`;
    if (symbolPosition === "LEFT_SPACE")
      return `${setting.currencySymbol} ${value}`;
    if (symbolPosition === "RIGHT_SPACE")
      return `${value} ${setting.currencySymbol}`;
    return `${setting.currencySymbol}${value}`;
  }, [
    decimalPlaces,
    decimalSeparator,
    setting.currencySymbol,
    symbolPosition,
    thousandSeparator,
  ]);

  const orderPreview = `${(prefix || "ORD").toUpperCase()}-${new Date()
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "")}-XXXXXX`;

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-[12px] lg:grid-cols-[220px_minmax(0,1fr)]",
        !embedded && "min-h-[calc(100vh-56px)] pt-[12px]"
      )}
    >
      <aside className="min-w-0 lg:sticky lg:top-[12px] lg:self-start">
        <div className="kv-frame p-[4px]">
          <div className="px-[8px] py-[6px]">
            <p className="text-[13px] font-medium text-kv-secondary-fg">eCommerce</p>
          </div>
          {/* A row of chips on narrow screens, a list from lg. */}
          <nav
            aria-label="Pengaturan eCommerce"
            className="flex gap-[2px] overflow-x-auto rounded-[10px] border-[0.8px] border-kv-input bg-kv-card p-[4px] [scrollbar-width:none] lg:flex-col lg:overflow-visible"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const on = active === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActive(tab.id)}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex h-[32px] shrink-0 items-center gap-[8px] rounded-[7px] px-[10px] text-left text-[13px] outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-kv-ring/40",
                    on
                      ? "bg-kv-secondary font-medium text-kv-fg shadow-[inset_0_0_0_0.8px_rgb(var(--kv-border))]"
                      : "text-kv-secondary-fg hover:bg-kv-hover hover:text-kv-fg"
                  )}
                >
                  <Icon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.6} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      <main className="kv-editor w-full min-w-0">
        {active === "general" && (
          <form className="flex flex-col gap-[12px]">
            <SectionFields section="general" loadedAt={loadedAt} />
            <TabHeading title="Umum" description="Pengaturan umum toko online Anda." />
            <EditorSection title="Mata Uang">
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Mata Uang</Label>
                  <input type="hidden" name="currencyCode" value="IDR" />
                  <input type="hidden" name="currencyLocale" value="id-ID" />
                  <input type="hidden" name="currencySymbol" value="Rp" />
                  <Select defaultValue="IDR" disabled>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="IDR">Indonesian Rupiah (IDR)</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Posisi Simbol</Label>
                  <input type="hidden" name="currencySymbolPosition" value={symbolPosition} />
                  <Select value={symbolPosition} onValueChange={(v) => setSymbolPosition(v as typeof symbolPosition)} disabled={!canEdit}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LEFT">Kiri - Rp100</SelectItem>
                      <SelectItem value="LEFT_SPACE">Kiri spasi - Rp 100</SelectItem>
                      <SelectItem value="RIGHT">Kanan - 100Rp</SelectItem>
                      <SelectItem value="RIGHT_SPACE">Kanan spasi - 100 Rp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Pemisah Ribuan</Label>
                  <input type="hidden" name="thousandSeparator" value={thousandSeparator} />
                  <Select value={thousandSeparator} onValueChange={setThousandSeparator} disabled={!canEdit}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value=".">Titik - 1.000.000</SelectItem>
                      <SelectItem value=",">Koma - 1,000,000</SelectItem>
                      <SelectItem value=" ">Spasi - 1 000 000</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Pemisah Desimal</Label>
                  <input type="hidden" name="decimalSeparator" value={decimalSeparator} />
                  <Select value={decimalSeparator} onValueChange={setDecimalSeparator} disabled={!canEdit || decimalPlaces === 0}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value=",">Koma - 10,50</SelectItem>
                      <SelectItem value=".">Titik - 10.50</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Jumlah Desimal</Label>
                  <input type="hidden" name="decimalPlaces" value={decimalPlaces} />
                  <Select value={String(decimalPlaces)} onValueChange={(v) => setDecimalPlaces(Number(v))} disabled={!canEdit}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0 - Rp1.234.567</SelectItem>
                      <SelectItem value="2">2 - Rp1.234.567,00</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Preview</Label>
                  <div className="rounded-lg border border-kv-border px-4 py-3 text-lg font-semibold">
                    {pricePreview}
                  </div>
                </div>
              </div>
            </EditorSection>
            <SaveBar canEdit={canEdit} />
          </form>
        )}

        {active === "checkout" && (
          <form className="flex flex-col gap-[12px]">
            <SectionFields section="checkout" loadedAt={loadedAt} />
            <TabHeading title="Checkout" description="Konfigurasi proses checkout dan batas waktu pembayaran." />
            <EditorSection title="Alur Belanja" description="Atur bagaimana pelanggan menyelesaikan pesanan.">
                <SettingRow title="Checkout Perlu Login / Register" description="Pelanggan wajib login sebelum lanjut checkout.">
                  <HiddenSwitch name="checkoutRequireLogin" checked={requireLogin} onCheckedChange={setRequireLogin} disabled={!canEdit} />
                </SettingRow>
                <SettingRow title="Buat Akun Otomatis dari Email Checkout" description="Sistem menyimpan customer dari email checkout untuk order, membership, dan follow-up.">
                  <HiddenSwitch name="checkoutAutoCreateAccount" checked={autoAccount} onCheckedChange={setAutoAccount} disabled={!canEdit} />
                </SettingRow>
                <SettingRow title="Aktifkan Form Kupon" description="Tampilkan input kode kupon pada checkout.">
                  <HiddenSwitch name="checkoutCouponEnabled" checked={couponEnabled} onCheckedChange={setCouponEnabled} disabled={!canEdit} />
                </SettingRow>
                <SettingRow title="Aktifkan Catatan Penjual" description="Tampilkan kolom catatan opsional saat checkout.">
                  <HiddenSwitch name="checkoutSellerNoteEnabled" checked={noteEnabled} onCheckedChange={setNoteEnabled} disabled={!canEdit} />
                </SettingRow>
              
            </EditorSection>
            <EditorSection title="Format Nomor Pesanan">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Prefix (3-6 karakter)</Label>
                  <Input name="orderNumberPrefix" value={prefix} disabled={!canEdit} onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} />
                  <p className="text-xs text-kv-muted-fg">Hanya huruf dan angka.</p>
                </div>
                <div className="rounded-lg border border-dashed border-kv-border p-4">
                  <p className="text-[11px] font-medium uppercase text-kv-muted-fg">Preview nomor pesanan</p>
                  <p className="mt-2 font-semibold">{orderPreview}</p>
                </div>
              </div>
            </EditorSection>
            <EditorSection title="Batas Waktu Pembayaran">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nilai</Label>
                  <Input name="paymentTimeoutValue" type="number" min={1} defaultValue={setting.paymentTimeoutValue} disabled={!canEdit} />
                </div>
                <div className="space-y-2">
                  <Label>Satuan Waktu</Label>
                  <select name="paymentTimeoutUnit" defaultValue={setting.paymentTimeoutUnit} disabled={!canEdit} className="kv-field h-[32px] w-full rounded-[8px] border-[0.8px] border-kv-border bg-kv-card px-[10px] text-[13px] text-kv-fg outline-none transition-colors hover:border-[#d1d5db] focus-visible:border-[#9ca3af] disabled:opacity-50">
                    <option value="MINUTES">Menit</option>
                    <option value="HOURS">Jam</option>
                    <option value="DAYS">Hari</option>
                  </select>
                </div>
              </div>
            </EditorSection>
            <SaveBar canEdit={canEdit} />
          </form>
        )}

        {active === "payments" && (
          <div className="space-y-6">
            <TabHeading title="Pembayaran" description="Pilih dan konfigurasi metode pembayaran untuk toko-mu." />
            <EditorSection title="Metode Pembayaran Manual" description="Atur rekening bank atau dompet digital untuk transfer manual." action={<ManualPaymentDialog canEdit={canEdit} />}>
                {manualMethods.length === 0 ? (
                  <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-kv-border text-center">
                    <Settings2 className="h-10 w-10 text-zinc-300" />
                    <p className="mt-3 font-medium">Belum ada metode pembayaran</p>
                    <p className="mt-1 max-w-sm text-sm text-kv-muted-fg">
                      Tambahkan metode pembayaran manual agar pembeli bisa transfer langsung.
                    </p>
                    <div className="mt-4"><ManualPaymentDialog label="Tambah Sekarang" canEdit={canEdit} /></div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {manualMethods.map((method) => (
                      <div key={method.id} className="flex items-center justify-between rounded-lg border border-kv-border p-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{method.name}</p>
                            <Badge variant={method.isActive ? "success" : "secondary"}>{method.isActive ? "Aktif" : "Nonaktif"}</Badge>
                          </div>
                          <p className="mt-1 text-sm text-kv-muted-fg">
                            {[method.accountName, method.accountNumber].filter(Boolean).join(" - ") || "Instruksi manual"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <ManualPaymentDialog
                            label="Edit"
                            canEdit={canEdit}
                            method={method}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={!canEdit}
                            onClick={async () => {
                              await deleteManualPaymentMethodAction(method.id);
                              router.refresh();
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              
            </EditorSection>

            <form className="flex flex-col gap-[12px]">
              <SectionFields section="payments" loadedAt={loadedAt} />
              <div className="rounded-xl border border-kv-border p-4 dark:border-zinc-800">
                <ConnectionTestButton
                  provider="MIDTRANS"
                  label="Tes server key Midtrans"
                  disabled={!canEdit}
                />
              </div>
              <input type="hidden" name="midtransEnabled" value={String(midtransEnabled)} />
              <input
                type="hidden"
                name="midtransIsProduction"
                value={String(midtransIsProduction)}
              />
              <EditorSection title="Midtrans" description="Kredensial milik toko ini sendiri. Dikosongkan berarti
                    memakai kredensial bawaan server.">
                <div className="space-y-1">
                  <SettingRow
                    title="Aktifkan Midtrans"
                    description="Matikan untuk menerima transfer manual saja."
                  >
                    <HiddenSwitch
                      name="midtransActive"
                      checked={midtransEnabled}
                      onCheckedChange={setMidtransEnabled}
                      disabled={!canEdit}
                    />
                  </SettingRow>
                  {midtransEnabled ? (
                    <>
                      <SettingRow
                        title="Mode produksi"
                        description="Nonaktif memakai sandbox. Pastikan kunci cocok dengan modenya."
                      >
                        <HiddenSwitch
                          name="midtransProductionMode"
                          checked={midtransIsProduction}
                          onCheckedChange={setMidtransIsProduction}
                          disabled={!canEdit}
                        />
                      </SettingRow>
                      <div className="max-w-lg space-y-2 border-b border-kv-border/70 py-5">
                        <Label htmlFor="midtransServerKey">Server Key</Label>
                        <Input
                          id="midtransServerKey"
                          name="midtransServerKey"
                          type="password"
                          autoComplete="off"
                          defaultValue=""
                          placeholder={
                            secretHints.midtransServerKey
                              ? `Tersimpan (${secretHints.midtransServerKey}) — kosongkan untuk tetap memakai`
                              : "SB-Mid-server-..."
                          }
                          disabled={!canEdit}
                        />
                      </div>
                      <div className="max-w-lg space-y-2 py-5">
                        <Label htmlFor="midtransClientKey">Client Key</Label>
                        <Input
                          id="midtransClientKey"
                          name="midtransClientKey"
                          autoComplete="off"
                          defaultValue=""
                          placeholder={
                            secretHints.midtransClientKey
                              ? `Tersimpan (${secretHints.midtransClientKey}) — kosongkan untuk tetap memakai`
                              : "SB-Mid-client-..."
                          }
                          disabled={!canEdit}
                        />
                      </div>
                    </>
                  ) : null}
                </div>
              </EditorSection>
              <SaveBar canEdit={canEdit} />
            </form>
          </div>
        )}

        {active === "shipping" && (
          <form className="flex flex-col gap-[12px]">
            <SectionFields section="shipping" loadedAt={loadedAt} />
            <TabHeading title="Pengiriman" description="Lokasi pickup dan ekspedisi yang kamu gunakan." />
            <EditorSection title="Satuan Default Produk">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Satuan Dimensi</Label>
                  <select name="defaultDimensionUnit" defaultValue={setting.defaultDimensionUnit} disabled={!canEdit} className="kv-field h-[32px] w-full rounded-[8px] border-[0.8px] border-kv-border bg-kv-card px-[10px] text-[13px] text-kv-fg outline-none transition-colors hover:border-[#d1d5db] focus-visible:border-[#9ca3af] disabled:opacity-50">
                    <option value="CM">Sentimeter (cm)</option>
                    <option value="M">Meter (m)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Satuan Berat</Label>
                  <select name="defaultWeightUnit" defaultValue={setting.defaultWeightUnit} disabled={!canEdit} className="kv-field h-[32px] w-full rounded-[8px] border-[0.8px] border-kv-border bg-kv-card px-[10px] text-[13px] text-kv-fg outline-none transition-colors hover:border-[#d1d5db] focus-visible:border-[#9ca3af] disabled:opacity-50">
                    <option value="KG">Kilogram (kg)</option>
                    <option value="G">Gram (g)</option>
                  </select>
                </div>
              </div>
            </EditorSection>
            <EditorSection title="Metode Pengiriman Cadangan" description="Pastikan produk fisik tetap dapat checkout saat tarif otomatis tidak digunakan.">
              <div className="space-y-1">
                <SettingRow title="Tarif tetap" description="Biaya pengiriman tetap untuk seluruh tujuan.">
                  <HiddenSwitch name="flatRateEnabled" checked={flatRateEnabled} onCheckedChange={setFlatRateEnabled} disabled={!canEdit} />
                </SettingRow>
                {flatRateEnabled ? (
                  <div className="grid gap-4 border-b border-kv-border/70 py-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Nama metode</Label>
                      <Input name="flatRateName" defaultValue={setting.flatRateName} disabled={!canEdit} />
                    </div>
                    <div className="space-y-2">
                      <Label>Biaya (Rp)</Label>
                      <Input name="flatRateCost" type="number" min={0} defaultValue={setting.flatRateCost} disabled={!canEdit} />
                    </div>
                  </div>
                ) : null}
                <SettingRow title="Gratis ongkir" description="Tersedia jika subtotal mencapai nilai minimum.">
                  <HiddenSwitch name="freeShippingEnabled" checked={freeShippingEnabled} onCheckedChange={setFreeShippingEnabled} disabled={!canEdit} />
                </SettingRow>
                {freeShippingEnabled ? (
                  <div className="max-w-sm space-y-2 border-b border-kv-border/70 py-5">
                    <Label>Minimum belanja (Rp)</Label>
                    <Input name="freeShippingMinimum" type="number" min={0} defaultValue={setting.freeShippingMinimum} disabled={!canEdit} />
                  </div>
                ) : null}
                <SettingRow title="Ambil di lokasi" description="Pembeli mengambil pesanan tanpa biaya kirim.">
                  <HiddenSwitch name="pickupEnabled" checked={pickupEnabled} onCheckedChange={setPickupEnabled} disabled={!canEdit} />
                </SettingRow>
                <SettingRow title="Bayar di tempat (COD)" description="Pembeli membayar tunai ke kurir. Pesanan COD tidak kedaluwarsa.">
                  <HiddenSwitch name="codEnabled" checked={codEnabled} onCheckedChange={setCodEnabled} disabled={!canEdit} />
                </SettingRow>
                {codEnabled ? (
                  <div className="grid gap-4 border-b border-kv-border/70 py-5 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="codFee">Biaya COD (Rp)</Label>
                      <Input id="codFee" name="codFee" type="number" min={0} defaultValue={setting.codFee} disabled={!canEdit} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="codMinimum">Minimum belanja (Rp)</Label>
                      <Input id="codMinimum" name="codMinimum" type="number" min={0} defaultValue={setting.codMinimum} disabled={!canEdit} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="codMaximum">Maksimum belanja (Rp)</Label>
                      <Input id="codMaximum" name="codMaximum" type="number" min={0} placeholder="Tanpa batas" defaultValue={setting.codMaximum ?? ""} disabled={!canEdit} />
                    </div>
                  </div>
                ) : null}
              </div>
            </EditorSection>
            <EditorSection title="Lokasi Pickup / Gudang" description="Tambahkan lokasi pickup. Lokasi default dipakai untuk cek ongkir otomatis." action={<PickupDialog canEdit={canEdit} />}>
                {pickupLocations.length === 0 ? (
                  <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-kv-border text-center text-sm text-kv-muted-fg">
                    Belum ada lokasi pickup. Tambahkan gudang atau toko kamu.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pickupLocations.map((location) => (
                      <div key={location.id} className="flex items-start justify-between rounded-lg border border-kv-border p-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{location.name}</p>
                            {location.isDefault ? <Badge>Default</Badge> : null}
                          </div>
                          <p className="mt-1 text-sm text-kv-muted-fg">{location.address}</p>
                          <p className="mt-1 text-xs text-kv-subtle">{[location.city, location.province, location.postalCode].filter(Boolean).join(", ")}</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={!canEdit}
                          onClick={async () => {
                            await deletePickupLocationAction(location.id);
                            router.refresh();
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              
            </EditorSection>
            <EditorSection title="Ongkir (Komerce)" description={<>RajaOngkir migrasi ke Komerce Collaborator. Daftar/login &
                  ambil API key di{" "}
                  <a
                    href="https://collaborator.komerce.id"
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    collaborator.komerce.id
                  </a>
                  . Endpoint lama (api.rajaongkir.com / pro.rajaongkir.com) sudah
                  tidak aktif.</>}>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input
                    name="rajaOngkirApiKey"
                    defaultValue=""
                    placeholder={
                      secretHints.rajaOngkirApiKey
                        ? `Tersimpan (${secretHints.rajaOngkirApiKey}) — kosongkan untuk tetap memakai`
                        : "Tempel API key Komerce / RajaOngkir-mu"
                    }
                    disabled={!canEdit}
                  />
                  <p className="text-xs text-kv-muted-fg">
                    Header <code>x-api-key</code> dikirim ke{" "}
                    <code>api.collaborator.komerce.id</code>. Tanpa key, ongkir
                    tidak muncul di checkout.
                  </p>
                </div>
                <OriginDestinationField
                  defaultId={setting.shippingOriginCityId || ""}
                  defaultName={setting.shippingOriginCityName || ""}
                  disabled={!canEdit}
                />
                <div className="space-y-2">
                  <Label>Kurir aktif</Label>
                  <Input
                    name="shippingCouriers"
                    defaultValue={(setting.shippingCouriers ?? []).join(", ")}
                    placeholder="jne, pos, tiki, jnt, sicepat"
                    disabled={!canEdit}
                  />
                  <p className="text-xs text-kv-muted-fg">
                    Pisah dengan koma. Komerce mendukung antara lain{" "}
                    <code>jne</code>, <code>jnt</code>, <code>sicepat</code>,{" "}
                    <code>pos</code>, <code>tiki</code>, <code>ninja</code>,{" "}
                    <code>idexpress</code>.
                  </p>
                </div>
              </div>
            </EditorSection>
            <EditorSection title="Agregator lain (opsional)" description="Field opsional untuk integrasi agregator lain.">
              <div className="space-y-2">
                <Label>Mengantar API Key</Label>
                <Input name="shippingAggregatorApiKey" defaultValue="" placeholder={secretHints.shippingAggregatorApiKey ? `Tersimpan (${secretHints.shippingAggregatorApiKey}) — kosongkan untuk tetap memakai` : "(opsional)"} disabled={!canEdit} />
              </div>
            </EditorSection>
            <SaveBar canEdit={canEdit} />
          </form>
        )}

        {active === "tax" && (
          <form className="flex flex-col gap-[12px]">
            <SectionFields section="tax" loadedAt={loadedAt} />
            <TabHeading title="Pajak & Invoice" description="Atur perhitungan pajak dan nomor dokumen transaksi." />
            <EditorSection title="Pajak Penjualan">
              <div className="space-y-1">
                <SettingRow title="Aktifkan pajak" description="Pajak dihitung ulang di server saat order dibuat.">
                  <HiddenSwitch name="taxEnabled" checked={taxEnabled} onCheckedChange={setTaxEnabled} disabled={!canEdit} />
                </SettingRow>
                {taxEnabled ? (
                  <>
                    <div className="max-w-sm space-y-2 border-b border-kv-border/70 py-5">
                      <Label>Tarif (basis point, 1100 = 11%)</Label>
                      <Input name="taxRateBps" type="number" min={0} max={10000} defaultValue={setting.taxRateBps} disabled={!canEdit} />
                    </div>
                    <SettingRow title="Harga sudah termasuk pajak" description="Jika nonaktif, pajak ditambahkan di atas subtotal.">
                      <HiddenSwitch name="pricesIncludeTax" checked={pricesIncludeTax} onCheckedChange={setPricesIncludeTax} disabled={!canEdit} />
                    </SettingRow>
                  </>
                ) : null}
              </div>
            </EditorSection>
            <EditorSection title="Nomor Invoice">
              <div className="max-w-sm space-y-2">
                <Label>Prefix invoice</Label>
                <Input name="invoicePrefix" defaultValue={setting.invoicePrefix} maxLength={8} disabled={!canEdit} />
              </div>
            </EditorSection>
            <SaveBar canEdit={canEdit} />
          </form>
        )}

        {active === "stock" && (
          <form className="flex flex-col gap-[12px]">
            <SectionFields section="stock" loadedAt={loadedAt} />
            <TabHeading title="Stok" description="Atur bagaimana stok produk fisik diamankan saat checkout." />
            <EditorSection title="Reservasi stok">
              <div className="space-y-4">
                <div className="max-w-sm space-y-2">
                  <Label>Stok diamankan ketika</Label>
                  <select name="stockDecrementTiming" defaultValue={setting.stockDecrementTiming} disabled={!canEdit} className="kv-field h-[32px] w-full rounded-[8px] border-[0.8px] border-kv-border bg-kv-card px-[10px] text-[13px] text-kv-fg outline-none transition-colors hover:border-[#d1d5db] focus-visible:border-[#9ca3af] disabled:opacity-50">
                    <option value="CHECKOUT">Checkout dibuat (reserve stok)</option>
                    <option value="PAID">Order dibayar (status paid)</option>
                  </select>
                </div>
                <div className="max-w-sm space-y-2">
                  <Label>Ambang alert stok rendah</Label>
                  <Input
                    name="lowStockThreshold"
                    type="number"
                    min={0}
                    defaultValue={setting.lowStockThreshold}
                    disabled={!canEdit}
                  />
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Mode checkout akan mengurangi stok tersedia saat order dibuat, lalu mengembalikannya otomatis jika pembayaran gagal, kedaluwarsa, atau dibatalkan.
                </div>
              </div>
            </EditorSection>
            <SaveBar canEdit={canEdit} />
          </form>
        )}

        {active === "sound" && (
          <form className="flex flex-col gap-[12px]">
            <SectionFields section="sound" loadedAt={loadedAt} />
            <TabHeading title="Suara order" description="Atur notifikasi suara saat ada pesanan masuk atau pesanan dibayar." />
            <EditorSection title="Notifikasi suara" bodyClassName="py-[4px]">
                <SettingRow title="Bunyi Notifikasi Order Masuk" description="Putar suara saat ada pesanan baru masuk ke sistem.">
                  <HiddenSwitch name="orderSoundNew" checked={soundNew} onCheckedChange={setSoundNew} disabled={!canEdit} />
                </SettingRow>
                <SettingRow title="Bunyi Notifikasi Order Dibayar" description="Putar suara saat status pembayaran pesanan berubah menjadi lunas.">
                  <HiddenSwitch name="orderSoundPaid" checked={soundPaid} onCheckedChange={setSoundPaid} disabled={!canEdit} />
                </SettingRow>
              
            </EditorSection>
            <SaveBar canEdit={canEdit} />
          </form>
        )}
      </main>
    </div>
  );
}

function ManualPaymentDialog({
  label = "Tambah Metode",
  canEdit = true,
  method,
}: {
  label?: string;
  canEdit?: boolean;
  method?: ManualPaymentMethod;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isActive, setIsActive] = useState(method?.isActive ?? true);
  const [type, setType] = useState<string>(method?.type ?? "BANK_TRANSFER");
  const [qrImageUrl, setQrImageUrl] = useState<string>(method?.qrImageUrl ?? "");
  const [qrUploading, setQrUploading] = useState(false);
  const isEdit = Boolean(method);

  async function uploadQrImage(file: File | undefined) {
    if (!file) return;
    setQrUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && data?.url) {
        setQrImageUrl(data.url);
      } else {
        toast.error(data?.error ?? "Upload gagal.");
      }
    } catch {
      toast.error("Upload gagal.");
    } finally {
      setQrUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={label === "Tambah Sekarang" ? "ghost" : "outline"}
          size="sm"
          disabled={!canEdit}
        >
          {!isEdit ? <Plus className="h-4 w-4" /> : null}
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Metode Pembayaran" : "Tambah Metode Pembayaran"}
          </DialogTitle>
          <DialogDescription>
            Atur rekening atau e-wallet untuk transfer manual.
          </DialogDescription>
        </DialogHeader>
        <form action={async (formData) => {
          const result = isEdit
            ? await updateManualPaymentMethodAction(method!.id, formData)
            : await createManualPaymentMethodAction(formData);
          if (result.ok) {
            setOpen(false);
            router.refresh();
          }
        }} className="space-y-4">
          <input type="hidden" name="isActive" value={String(isActive)} />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Jenis</Label>
              <select
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={!canEdit}
                className="h-9 w-full rounded-lg border border-kv-border bg-white px-3 text-sm disabled:opacity-60"
              >
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="EWALLET">E-wallet</option>
                <option value="QRIS">QRIS</option>
                <option value="OTHER">Lainnya</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Nama Metode</Label>
              <Input
                name="name"
                placeholder="BCA, Mandiri, DANA..."
                defaultValue={method?.name ?? ""}
                required
                disabled={!canEdit}
              />
            </div>
          </div>
          <input type="hidden" name="qrImageUrl" value={type === "QRIS" ? qrImageUrl : ""} />

          {type === "QRIS" ? (
            <div className="space-y-2">
              <Label>Gambar QRIS</Label>
              <div className="flex items-start gap-3">
                <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-kv-border bg-kv-secondary dark:border-zinc-700 dark:bg-zinc-900">
                  {qrImageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={qrImageUrl} alt="QRIS" className="h-full w-full object-contain" />
                  ) : (
                    <QrCode className="h-8 w-8 text-kv-subtle" />
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <label
                    className={`inline-flex h-9 w-fit cursor-pointer items-center gap-2 rounded-lg border border-kv-border bg-white px-3 text-xs font-medium text-kv-fg hover:bg-kv-hover ${!canEdit || qrUploading ? "pointer-events-none opacity-60" : ""}`}
                  >
                    {qrUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {qrUploading ? "Mengunggah…" : qrImageUrl ? "Ganti gambar" : "Upload QRIS"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      disabled={!canEdit || qrUploading}
                      onChange={(e) => uploadQrImage(e.target.files?.[0])}
                    />
                  </label>
                  {qrImageUrl ? (
                    <button
                      type="button"
                      onClick={() => setQrImageUrl("")}
                      disabled={!canEdit || qrUploading}
                      className="inline-flex h-7 w-fit items-center gap-1 rounded-md px-2 text-[11px] text-kv-muted-fg hover:text-red-600 disabled:opacity-60"
                    >
                      <X className="h-3 w-3" /> Hapus
                    </button>
                  ) : null}
                  <p className="text-[11px] text-kv-muted-fg">
                    PNG/JPG/WEBP, maks 5 MB. Gambar ini akan tampil di halaman thanks page / invoice saat pembeli memilih QRIS.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Atas Nama</Label><Input name="accountName" defaultValue={method?.accountName ?? ""} disabled={!canEdit} /></div>
              <div className="space-y-2"><Label>Nomor Rekening / Akun</Label><Input name="accountNumber" defaultValue={method?.accountNumber ?? ""} disabled={!canEdit} /></div>
            </div>
          )}
          <div className="space-y-2">
            <Label>Instruksi</Label>
            <Textarea
              name="instructions"
              rows={3}
              placeholder="Instruksi pembayaran untuk pembeli."
              defaultValue={method?.instructions ?? ""}
              disabled={!canEdit}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-kv-border px-3 py-2">
            <Label>Status aktif</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} disabled={!canEdit} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" disabled={!canEdit}>
              {isEdit ? "Simpan Perubahan" : "Simpan Metode"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PickupDialog({ canEdit = true }: { canEdit?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!canEdit}><MapPin className="h-4 w-4" />Tambah Lokasi</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tambah Lokasi Pickup</DialogTitle>
          <DialogDescription>Alamat ini dipakai untuk gudang dan pickup pengiriman.</DialogDescription>
        </DialogHeader>
        <form action={async (formData) => {
          const result = await createPickupLocationAction(formData);
          if (result.ok) {
            setOpen(false);
            router.refresh();
          }
        }} className="space-y-4">
          <input type="hidden" name="isActive" value={String(isActive)} />
          <input type="hidden" name="isDefault" value={String(isDefault)} />
          <div className="space-y-2"><Label>Nama Lokasi</Label><Input name="name" placeholder="Gudang Utama" required disabled={!canEdit} /></div>
          <div className="space-y-2"><Label>Alamat</Label><Textarea name="address" rows={3} required disabled={!canEdit} /></div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2"><Label>Kota</Label><Input name="city" disabled={!canEdit} /></div>
            <div className="space-y-2"><Label>Provinsi</Label><Input name="province" disabled={!canEdit} /></div>
            <div className="space-y-2"><Label>Kode Pos</Label><Input name="postalCode" disabled={!canEdit} /></div>
          </div>
          <div className="space-y-2"><Label>Telepon</Label><Input name="phone" disabled={!canEdit} /></div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border border-kv-border px-3 py-2"><Label>Jadikan default</Label><Switch checked={isDefault} onCheckedChange={setIsDefault} disabled={!canEdit} /></div>
            <div className="flex items-center justify-between rounded-lg border border-kv-border px-3 py-2"><Label>Status aktif</Label><Switch checked={isActive} onCheckedChange={setIsActive} disabled={!canEdit} /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" disabled={!canEdit}>Simpan Lokasi</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TabHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="px-[4px]">
      <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-kv-fg">{title}</h2>
      <p className="mt-[2px] text-[12px] text-kv-muted-fg">{description}</p>
    </div>
  );
}
