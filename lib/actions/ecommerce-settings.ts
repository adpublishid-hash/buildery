"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getOrCreateEcommerceSetting } from "@/lib/ecommerce-settings";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { rateLimitShared } from "@/lib/rate-limit";
import { getCurrentWorkspace } from "@/lib/workspace";
import {
  CLEAR_SECRET_SUFFIX,
  ECOMMERCE_SECRET_FIELDS,
  resolveSecretUpdate,
} from "@/lib/secret-fields";
import {
  changedSettingFields,
  describeSettingsChange,
  recordSettingsAudit,
} from "@/lib/settings-audit";
import {
  isStaleSettingsWrite,
  SETTINGS_VERSION_FIELD,
  STALE_WRITE_MESSAGE,
} from "@/lib/settings-version";
import {
  currencySymbolPositionSchema,
  ecommerceSectionSchema,
  manualPaymentMethodTypeSchema,
  measurementUnitSchema,
  paymentTimeoutUnitSchema,
  stockDecrementTimingSchema,
} from "@/lib/zod";

type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type EditableWorkspace = {
  workspace: Awaited<ReturnType<typeof getCurrentWorkspace>> extends infer T
    ? T extends { workspace: infer W }
      ? W
      : never
    : never;
  role: NonNullable<Awaited<ReturnType<typeof getCurrentWorkspace>>>["role"];
  userId: string;
};

async function requireEditableWorkspace(): Promise<EditableWorkspace | null> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) return null;
  return {
    workspace: current.workspace,
    role: current.role,
    userId: session.user.id,
  };
}

/**
 * Field yang memutuskan ke mana uang pelanggan mengalir, atau yang memegang
 * kredensial untuk memindahkannya.
 *
 * Menyimpannya di balik `workspace.edit` (OWNER/ADMIN) dan bukan
 * `content.edit`: peran Editor dijelaskan ke pengguna sebagai "tanpa akses
 * billing", tapi dulu Editor tetap bisa mengganti kunci Midtrans dan
 * menyalakan mode produksi.
 */
const MONEY_FIELDS = new Set<string>([
  ...ECOMMERCE_SECRET_FIELDS,
  "midtransEnabled",
  "midtransIsProduction",
]);

function deniesMoneyChange(
  current: EditableWorkspace,
  data: Record<string, unknown>
): boolean {
  const touchesMoney = Object.keys(data).some((key) => MONEY_FIELDS.has(key));
  return touchesMoney && !canInWorkspace(current.role, "workspace.edit");
}

const MONEY_DENIED =
  "Hanya Pemilik atau Admin yang boleh mengubah kredensial pembayaran dan tujuan transfer.";

/** Membatasi laju penyimpanan pengaturan per pengguna. */
async function settingsRateLimit(userId: string, bucket: string) {
  return rateLimitShared(`settings:${bucket}:${userId}`, 30, 5 * 60 * 1000);
}

function bool(formData: FormData, key: string) {
  return formData.get(key) === "true";
}

function text(formData: FormData, key: string, fallback = "") {
  return String(formData.get(key) ?? fallback).trim();
}

function int(formData: FormData, key: string, fallback: number) {
  const value = Number(formData.get(key));
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function revalidateEcommerceSettings() {
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/ecommerce/settings");
}

export async function updateEcommerceSettingsAction(
  formData: FormData
): Promise<ActionResult> {
  const actor = await requireEditableWorkspace();
  if (!actor) return { ok: false, error: "Tidak diizinkan." };

  const limit = await settingsRateLimit(actor.userId, "ecommerce");
  if (!limit.ok) {
    return {
      ok: false,
      error: "Terlalu sering menyimpan pengaturan. Coba lagi sebentar lagi.",
    };
  }

  // Section tak dikenal dulu menghasilkan payload kosong: simpanan "berhasil"
  // yang sebetulnya tidak mengubah apa pun.
  const parsedSection = ecommerceSectionSchema.safeParse(
    text(formData, "section", "general")
  );
  if (!parsedSection.success) {
    return { ok: false, error: "Bagian pengaturan tidak dikenal." };
  }
  const section = parsedSection.data;

  const workspace = actor.workspace;
  const current = await getOrCreateEcommerceSetting(workspace.id);
  const data: Record<string, unknown> = {};

  if (section === "general") {
    data.currencyCode = text(formData, "currencyCode", "IDR");
    data.currencyLocale = text(formData, "currencyLocale", "id-ID");
    data.currencySymbol = text(formData, "currencySymbol", "Rp");
    const position = currencySymbolPositionSchema.safeParse(
      text(formData, "currencySymbolPosition", "LEFT")
    );
    if (!position.success) {
      return {
        ok: false,
        error: "Posisi simbol mata uang tidak valid.",
        fieldErrors: { currencySymbolPosition: ["Pilihan tidak dikenal."] },
      };
    }
    data.currencySymbolPosition = position.data;
    data.thousandSeparator = text(formData, "thousandSeparator", ".");
    data.decimalSeparator = text(formData, "decimalSeparator", ",");
    data.decimalPlaces = Math.min(int(formData, "decimalPlaces", 0), 2);
  }

  if (section === "checkout") {
    const prefix = text(formData, "orderNumberPrefix")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);
    data.checkoutRequireLogin = bool(formData, "checkoutRequireLogin");
    data.checkoutAutoCreateAccount = bool(
      formData,
      "checkoutAutoCreateAccount"
    );
    data.checkoutCouponEnabled = bool(formData, "checkoutCouponEnabled");
    data.checkoutSellerNoteEnabled = bool(
      formData,
      "checkoutSellerNoteEnabled"
    );
    data.orderNumberPrefix = prefix || null;
    data.paymentTimeoutValue = Math.max(1, int(formData, "paymentTimeoutValue", 24));
    const timeoutUnit = paymentTimeoutUnitSchema.safeParse(
      text(formData, "paymentTimeoutUnit", "HOURS")
    );
    if (!timeoutUnit.success) {
      return {
        ok: false,
        error: "Satuan batas waktu pembayaran tidak valid.",
        fieldErrors: { paymentTimeoutUnit: ["Pilihan tidak dikenal."] },
      };
    }
    data.paymentTimeoutUnit = timeoutUnit.data;
  }

  if (section === "payments") {
    // Each store settles into its own Midtrans account, so the credentials
    // live on the workspace rather than in the deployment's env.
    data.midtransEnabled = bool(formData, "midtransEnabled");
    data.midtransIsProduction = bool(formData, "midtransIsProduction");
    // The keys are never sent to the browser, so a blank field keeps what is
    // stored. Only an explicit clear flag removes one.
    const serverKey = resolveSecretUpdate(
      formData.get("midtransServerKey"),
      formData.get(`midtransServerKey${CLEAR_SECRET_SUFFIX}`)
    );
    if (serverKey !== undefined) data.midtransServerKey = serverKey;
    const clientKey = resolveSecretUpdate(
      formData.get("midtransClientKey"),
      formData.get(`midtransClientKey${CLEAR_SECRET_SUFFIX}`)
    );
    if (clientKey !== undefined) data.midtransClientKey = clientKey;
  }

  if (section === "shipping") {
    const dimensionUnit = measurementUnitSchema.safeParse(
      text(formData, "defaultDimensionUnit", "CM")
    );
    const weightUnit = measurementUnitSchema.safeParse(
      text(formData, "defaultWeightUnit", "KG")
    );
    if (!dimensionUnit.success || !weightUnit.success) {
      return { ok: false, error: "Satuan berat atau dimensi tidak valid." };
    }
    data.defaultDimensionUnit = dimensionUnit.data;
    data.defaultWeightUnit = weightUnit.data;
    // Credentials: blank keeps the stored value (see lib/secret-fields.ts).
    for (const field of ["shippingAggregatorApiKey", "rajaOngkirApiKey"] as const) {
      const update = resolveSecretUpdate(
        formData.get(field),
        formData.get(`${field}${CLEAR_SECRET_SUFFIX}`)
      );
      if (update !== undefined) data[field] = update;
    }
    data.shippingOriginCityId = text(formData, "shippingOriginCityId") || null;
    data.shippingOriginCityName =
      text(formData, "shippingOriginCityName") || null;
    const couriers = text(formData, "shippingCouriers");
    data.shippingCouriers = couriers
      ? couriers
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 12)
      : [];
    data.flatRateEnabled = bool(formData, "flatRateEnabled");
    data.flatRateName = text(formData, "flatRateName", "Flat rate").slice(0, 80);
    data.flatRateCost = Math.min(int(formData, "flatRateCost", 0), 1_000_000_000);
    data.freeShippingEnabled = bool(formData, "freeShippingEnabled");
    data.freeShippingMinimum = Math.min(
      int(formData, "freeShippingMinimum", 0),
      1_000_000_000
    );
    data.pickupEnabled = bool(formData, "pickupEnabled");
    // COD lives with shipping: whether a courier carries the parcel is what
    // decides if it can be paid on arrival.
    data.codEnabled = bool(formData, "codEnabled");
    data.codFee = Math.min(int(formData, "codFee", 0), 1_000_000_000);
    data.codMinimum = Math.min(int(formData, "codMinimum", 0), 1_000_000_000);
    const codMaximumRaw = text(formData, "codMaximum", "").trim();
    data.codMaximum = codMaximumRaw
      ? Math.min(int(formData, "codMaximum", 0), 1_000_000_000)
      : null;
  }

  if (section === "tax") {
    data.taxEnabled = bool(formData, "taxEnabled");
    data.taxRateBps = Math.min(int(formData, "taxRateBps", 0), 10_000);
    data.pricesIncludeTax = bool(formData, "pricesIncludeTax");
    data.invoicePrefix =
      text(formData, "invoicePrefix", "INV")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 8) || "INV";
  }

  if (section === "stock") {
    const timing = stockDecrementTimingSchema.safeParse(
      text(formData, "stockDecrementTiming", "CHECKOUT")
    );
    if (!timing.success) {
      return { ok: false, error: "Waktu pengurangan stok tidak valid." };
    }
    data.stockDecrementTiming = timing.data;
    data.lowStockThreshold = Math.min(int(formData, "lowStockThreshold", 5), 1_000_000);
  }

  if (section === "sound") {
    data.orderSoundNew = bool(formData, "orderSoundNew");
    data.orderSoundPaid = bool(formData, "orderSoundPaid");
  }

  if (deniesMoneyChange(actor, data)) {
    return { ok: false, error: MONEY_DENIED };
  }

  if (isStaleSettingsWrite(formData.get(SETTINGS_VERSION_FIELD), current.updatedAt)) {
    return { ok: false, error: STALE_WRITE_MESSAGE };
  }

  const changedFields = changedSettingFields(
    current as unknown as Record<string, unknown>,
    data
  );

  await prisma.ecommerceSetting.update({
    where: { id: current.id },
    data,
  });

  await recordSettingsAudit(prisma, {
    workspaceId: workspace.id,
    actorId: actor.userId,
    action: `settings.ecommerce.${section}`,
    changedFields,
    summary: describeSettingsChange(`Pengaturan eCommerce (${section})`, changedFields),
    targetType: "ecommerceSetting",
    targetId: current.id,
  });

  revalidateEcommerceSettings();
  return { ok: true };
}

/**
 * Metode pembayaran manual adalah rekening dan QRIS yang dilihat pembeli saat
 * checkout — mengubahnya berarti mengubah ke mana uang mereka dikirim. Karena
 * itu seluruh CRUD-nya butuh `workspace.edit`, bukan `content.edit`.
 */
async function requirePaymentDestinationAccess() {
  const actor = await requireEditableWorkspace();
  if (!actor) return null;
  if (!canInWorkspace(actor.role, "workspace.edit")) return "denied" as const;
  return actor;
}

function parseManualMethodInput(formData: FormData) {
  const name = text(formData, "name");
  if (!name) {
    return { ok: false as const, error: "Nama metode wajib diisi." };
  }
  const type = manualPaymentMethodTypeSchema.safeParse(
    text(formData, "type", "BANK_TRANSFER")
  );
  if (!type.success) {
    return { ok: false as const, error: "Jenis metode pembayaran tidak valid." };
  }
  return {
    ok: true as const,
    data: {
      type: type.data,
      name,
      accountName: text(formData, "accountName") || null,
      accountNumber: text(formData, "accountNumber") || null,
      qrImageUrl: text(formData, "qrImageUrl") || null,
      instructions: text(formData, "instructions") || null,
      isActive: bool(formData, "isActive"),
    },
  };
}

export async function createManualPaymentMethodAction(
  formData: FormData
): Promise<ActionResult> {
  const actor = await requirePaymentDestinationAccess();
  if (!actor) return { ok: false, error: "Tidak diizinkan." };
  if (actor === "denied") return { ok: false, error: MONEY_DENIED };

  const limit = await settingsRateLimit(actor.userId, "manual-payment");
  if (!limit.ok) {
    return { ok: false, error: "Terlalu sering menyimpan. Coba lagi nanti." };
  }

  const parsed = parseManualMethodInput(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const workspace = actor.workspace;
  const setting = await getOrCreateEcommerceSetting(workspace.id);
  const created = await prisma.manualPaymentMethod.create({
    data: { workspaceId: workspace.id, settingId: setting.id, ...parsed.data },
  });

  await recordSettingsAudit(prisma, {
    workspaceId: workspace.id,
    actorId: actor.userId,
    action: "settings.payment_method.created",
    changedFields: Object.keys(parsed.data),
    summary: `Metode pembayaran manual ditambahkan: ${parsed.data.name} (${parsed.data.type})`,
    targetType: "manualPaymentMethod",
    targetId: created.id,
  });

  revalidateEcommerceSettings();
  return { ok: true };
}

export async function updateManualPaymentMethodAction(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const actor = await requirePaymentDestinationAccess();
  if (!actor) return { ok: false, error: "Tidak diizinkan." };
  if (actor === "denied") return { ok: false, error: MONEY_DENIED };

  const limit = await settingsRateLimit(actor.userId, "manual-payment");
  if (!limit.ok) {
    return { ok: false, error: "Terlalu sering menyimpan. Coba lagi nanti." };
  }

  const parsed = parseManualMethodInput(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const workspace = actor.workspace;
  const before = await prisma.manualPaymentMethod.findFirst({
    where: { id, workspaceId: workspace.id },
  });
  if (!before) {
    return { ok: false, error: "Metode pembayaran tidak ditemukan." };
  }

  await prisma.manualPaymentMethod.updateMany({
    where: { id, workspaceId: workspace.id },
    data: parsed.data,
  });

  const changedFields = changedSettingFields(
    before as unknown as Record<string, unknown>,
    parsed.data
  );
  await recordSettingsAudit(prisma, {
    workspaceId: workspace.id,
    actorId: actor.userId,
    action: "settings.payment_method.updated",
    // Rekening tujuan adalah inti dari perubahan ini, jadi selalu disebut.
    changedFields,
    summary: describeSettingsChange(
      `Metode pembayaran manual ${before.name}`,
      changedFields
    ),
    targetType: "manualPaymentMethod",
    targetId: id,
  });

  revalidateEcommerceSettings();
  return { ok: true };
}

export async function deleteManualPaymentMethodAction(id: string) {
  const actor = await requirePaymentDestinationAccess();
  if (!actor) return { ok: false, error: "Tidak diizinkan." };
  if (actor === "denied") return { ok: false, error: MONEY_DENIED };

  const workspace = actor.workspace;
  const before = await prisma.manualPaymentMethod.findFirst({
    where: { id, workspaceId: workspace.id },
    select: { id: true, name: true, type: true },
  });

  await prisma.manualPaymentMethod.deleteMany({
    where: { id, workspaceId: workspace.id },
  });

  if (before) {
    await recordSettingsAudit(prisma, {
      workspaceId: workspace.id,
      actorId: actor.userId,
      action: "settings.payment_method.deleted",
      changedFields: ["accountNumber", "qrImageUrl"],
      summary: `Metode pembayaran manual dihapus: ${before.name} (${before.type})`,
      targetType: "manualPaymentMethod",
      targetId: before.id,
    });
  }

  revalidateEcommerceSettings();
  return { ok: true };
}

export async function createPickupLocationAction(
  formData: FormData
): Promise<ActionResult> {
  const actor = await requireEditableWorkspace();
  if (!actor) return { ok: false, error: "Tidak diizinkan." };
  const workspace = actor.workspace;

  const setting = await getOrCreateEcommerceSetting(workspace.id);
  const name = text(formData, "name");
  const address = text(formData, "address");
  if (!name || !address) {
    return { ok: false, error: "Nama dan alamat pickup wajib diisi." };
  }

  const makeDefault = bool(formData, "isDefault");
  await prisma.$transaction(async (tx) => {
    if (makeDefault) {
      await tx.pickupLocation.updateMany({
        where: { workspaceId: workspace.id },
        data: { isDefault: false },
      });
    }
    await tx.pickupLocation.create({
      data: {
        workspaceId: workspace.id,
        settingId: setting.id,
        name,
        address,
        city: text(formData, "city") || null,
        province: text(formData, "province") || null,
        postalCode: text(formData, "postalCode") || null,
        phone: text(formData, "phone") || null,
        isDefault: makeDefault,
        isActive: bool(formData, "isActive"),
      },
    });
  });

  revalidateEcommerceSettings();
  return { ok: true };
}

export async function deletePickupLocationAction(id: string) {
  const actor = await requireEditableWorkspace();
  if (!actor) return { ok: false, error: "Tidak diizinkan." };
  const workspace = actor.workspace;

  await prisma.pickupLocation.deleteMany({
    where: { id, workspaceId: workspace.id },
  });
  revalidateEcommerceSettings();
  return { ok: true };
}
