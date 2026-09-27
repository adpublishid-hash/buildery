import "server-only";

import type { EcommerceSetting } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { MidtransConfig } from "@/lib/midtrans";

export const DEFAULT_ECOMMERCE_SETTINGS = {
  currencyCode: "IDR",
  currencyLocale: "id-ID",
  currencySymbol: "Rp",
  currencySymbolPosition: "LEFT" as const,
  thousandSeparator: ".",
  decimalSeparator: ",",
  decimalPlaces: 0,
  checkoutRequireLogin: false,
  checkoutAutoCreateAccount: true,
  checkoutCouponEnabled: true,
  checkoutSellerNoteEnabled: true,
  orderNumberPrefix: null,
  paymentTimeoutValue: 24,
  paymentTimeoutUnit: "HOURS" as const,
  defaultDimensionUnit: "CM",
  defaultWeightUnit: "KG",
  stockDecrementTiming: "CHECKOUT" as const,
  lowStockThreshold: 5,
  orderSoundNew: false,
  orderSoundPaid: false,
  shippingAggregatorApiKey: null,
  flatRateEnabled: false,
  flatRateName: "Flat rate",
  flatRateCost: 0,
  freeShippingEnabled: false,
  freeShippingMinimum: 0,
  pickupEnabled: false,
  taxEnabled: false,
  taxRateBps: 0,
  pricesIncludeTax: true,
  invoicePrefix: "INV",
};

export function getPaymentExpiry(
  setting: Pick<EcommerceSetting, "paymentTimeoutUnit" | "paymentTimeoutValue">
) {
  const value = Math.max(1, setting.paymentTimeoutValue || 24);
  const multiplier =
    setting.paymentTimeoutUnit === "MINUTES"
      ? 60 * 1000
      : setting.paymentTimeoutUnit === "DAYS"
        ? 24 * 60 * 60 * 1000
        : 60 * 60 * 1000;
  return new Date(Date.now() + value * multiplier);
}

export async function getOrCreateEcommerceSetting(workspaceId: string) {
  return prisma.ecommerceSetting.upsert({
    where: { workspaceId },
    update: {},
    create: {
      workspaceId,
      ...DEFAULT_ECOMMERCE_SETTINGS,
    },
  });
}

/**
 * A workspace's own Midtrans credentials, or null when it has none and should
 * fall back to the deployment's env vars.
 */
export async function getWorkspaceMidtransConfig(
  workspaceId: string
): Promise<MidtransConfig | null> {
  const setting = await prisma.ecommerceSetting.findUnique({
    where: { workspaceId },
    select: {
      midtransEnabled: true,
      midtransServerKey: true,
      midtransClientKey: true,
      midtransIsProduction: true,
    },
  });
  if (!setting) return null;
  return {
    enabled: setting.midtransEnabled,
    serverKey: setting.midtransServerKey,
    clientKey: setting.midtransClientKey,
    isProduction: setting.midtransIsProduction,
  };
}
